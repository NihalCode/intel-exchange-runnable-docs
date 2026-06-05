// Runs untrusted JavaScript inside a throwaway sandboxed iframe.
// The iframe uses sandbox="allow-scripts" WITHOUT allow-same-origin, so the
// code runs in an opaque origin with no access to our DOM, cookies, or storage.
//
// fetch() calls inside the sandbox are intercepted and relayed through the
// parent → /api/run server-side proxy, so they work despite the opaque origin.

import { injectOpenApiAuthIntoUrl } from "./credential-placeholders";
import { DISPLAY_BASE } from "./constants";

export interface SandboxResult {
  logs: string[];
  result?: string;
  error?: string;
  timedOut?: boolean;
}

export interface SandboxOptions {
  /** Replace DISPLAY_BASE with the user's real tenant base URL in fetch URLs */
  baseUrl?: string;
  /** Extra secrets to scrub from output */
  secretValues?: string[];
  /** Inject AccessID / Signature / Expires into proxied fetch URLs */
  getCredential?: (name: string) => string;
}

const TIMEOUT_MS = 12_000;

function sanitize(code: string): string {
  return code.replace(/<\/script/gi, "<\\/script");
}

/** Build the srcdoc HTML for the sandboxed iframe. */
function makeSrcdoc(code: string, nonce: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
(function(){
var NONCE=${JSON.stringify(nonce)};
var logs=[];
function fmt(v){
  if(typeof v==='string') return v;
  if(v instanceof Error) return v.stack||v.message||String(v);
  try{ return JSON.stringify(v,null,2); }catch(e){ return String(v); }
}
['log','info','warn','error','debug'].forEach(function(k){
  var orig=console[k]?console[k].bind(console):function(){};
  console[k]=function(){
    var args=Array.prototype.slice.call(arguments);
    logs.push(args.map(fmt).join(' '));
    try{ orig.apply(null,args); }catch(e){}
  };
});
function send(type,payload){
  parent.postMessage({__sbx:NONCE,type:type,payload:payload},'*');
}
window.onerror=function(msg){
  send('error',{logs:logs,error:String(msg)});
  return true;
};

// Intercept fetch — relay through parent which proxies to /api/run
var _fetchId=0;
window.fetch=function(url,opts){
  opts=opts||{};
  var id='f'+(++_fetchId);
  return new Promise(function(resolve,reject){
    var done=false;
    function handler(e){
      var d=e.data;
      if(!d||d.__sbx!==NONCE||d.type!=='fetchResp'||d.id!==id) return;
      if(done) return;
      done=true;
      window.removeEventListener('message',handler);
      if(d.err){ reject(new TypeError(d.err)); return; }
      var body=d.body||'';
      var status=d.status||0;
      var respHeaders=d.headers||[];
      resolve({
        ok: d.ok||false,
        status: status,
        statusText: d.statusText||'',
        headers:{
          get:function(name){
            var h=respHeaders.find(function(x){return x.name.toLowerCase()===name.toLowerCase();});
            return h?h.value:null;
          }
        },
        json:function(){
          try{ return Promise.resolve(JSON.parse(body)); }
          catch(e){ return Promise.reject(e); }
        },
        text:function(){ return Promise.resolve(body); },
        clone:function(){ return this; }
      });
    }
    window.addEventListener('message',handler);
    send('fetch',{
      id:id,
      method:(opts.method||'GET').toUpperCase(),
      url:String(url),
      headers:opts.headers?Object.keys(opts.headers).map(function(k){return{name:k,value:opts.headers[k]};}):[],
      body:(typeof opts.body==='string')?opts.body:undefined
    });
  });
};

// XMLHttpRequest stub (basic synchronous-style support)
window.XMLHttpRequest=function(){
  var self=this;
  self.readyState=0; self.status=0; self.statusText=''; self.responseText='';
  self.onreadystatechange=null; self.onload=null; self.onerror=null;
  self._method=''; self._url=''; self._headers={};
  self.open=function(m,u){ self._method=m; self._url=u; self.readyState=1; };
  self.setRequestHeader=function(k,v){ self._headers[k]=v; };
  self.send=function(body){
    window.fetch(self._url,{method:self._method,headers:self._headers,body:body}).then(function(r){
      self.status=r.status; self.statusText=r.statusText;
      return r.text();
    }).then(function(t){
      self.responseText=t; self.readyState=4;
      if(self.onreadystatechange) self.onreadystatechange();
      if(self.onload) self.onload();
    }).catch(function(e){
      if(self.onerror) self.onerror(e);
    });
  };
};

(async function(){
  try{
    var __result=await(async function(){
${sanitize(code)}
    })();
    send('done',{logs:logs,result:__result===undefined?undefined:fmt(__result)});
  }catch(e){
    send('error',{logs:logs,error:(e&&(e.stack||e.message))||String(e)});
  }
})();
})();
<\/script></body></html>`;
}

export function runJsInSandbox(
  code: string,
  options: SandboxOptions = {}
): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const { baseUrl = DISPLAY_BASE, secretValues = [], getCredential } = options;
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);

    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("aria-hidden", "true");
    Object.assign(iframe.style, {
      position: "absolute",
      width: "0",
      height: "0",
      border: "0",
      left: "-9999px",
    });

    let settled = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch {
        /* ignore */
      }
    };
    const finish = (r: SandboxResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(r);
    };

    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || data.__sbx !== nonce) return;

      if (data.type === "fetch") {
        // Relay through the /api/run proxy, substituting the display base URL.
        const originalUrl: string = data.payload?.url ?? "";
        let proxiedUrl = originalUrl.startsWith(DISPLAY_BASE)
          ? baseUrl.replace(/\/+$/, "") + originalUrl.slice(DISPLAY_BASE.length)
          : originalUrl;
        if (getCredential) {
          proxiedUrl = injectOpenApiAuthIntoUrl(proxiedUrl, getCredential);
        }

        fetch("/api/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: data.payload?.method ?? "GET",
            url: proxiedUrl,
            headers: data.payload?.headers ?? [],
            body: data.payload?.body,
          }),
        })
          .then((r) => r.json())
          .then((result: Record<string, unknown>) => {
            // Proxy error responses have {error, durationMs} — surface as fetch rejection.
            if (result.error && !result.status) {
              iframe.contentWindow?.postMessage(
                {
                  __sbx: nonce,
                  type: "fetchResp",
                  id: data.payload?.id,
                  err: String(result.error),
                },
                "*"
              );
            } else {
              iframe.contentWindow?.postMessage(
                { __sbx: nonce, type: "fetchResp", id: data.payload?.id, ...result },
                "*"
              );
            }
          })
          .catch((err: Error) => {
            iframe.contentWindow?.postMessage(
              {
                __sbx: nonce,
                type: "fetchResp",
                id: data.payload?.id,
                err: err.message,
              },
              "*"
            );
          });
        return;
      }

      const payload = data.payload || {};
      if (data.type === "done") {
        finish({ logs: payload.logs || [], result: payload.result });
      } else if (data.type === "error") {
        finish({ logs: payload.logs || [], error: payload.error });
      }
    };

    const timer = setTimeout(
      () =>
        finish({
          logs: [],
          timedOut: true,
          error: `Execution timed out after ${TIMEOUT_MS / 1000}s.`,
        }),
      TIMEOUT_MS
    );

    window.addEventListener("message", onMessage);
    iframe.srcdoc = makeSrcdoc(code, nonce);
    document.body.appendChild(iframe);

    void secretValues; // used by caller for output masking
  });
}
