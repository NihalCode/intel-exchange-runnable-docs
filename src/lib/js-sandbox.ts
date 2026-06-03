// Runs untrusted JavaScript inside a throwaway sandboxed iframe.
// The iframe uses sandbox="allow-scripts" WITHOUT allow-same-origin, so the
// code runs in an opaque origin with no access to our DOM, cookies, or storage.
// No eval / Function is used in the main app context.

export interface SandboxResult {
  logs: string[];
  result?: string;
  error?: string;
  timedOut?: boolean;
}

const TIMEOUT_MS = 6000;

export function runJsInSandbox(code: string): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const safeCode = code.replace(/<\/script/gi, "<\\/script");

    const srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
(function(){
  var NONCE = ${JSON.stringify(nonce)};
  var logs = [];
  function fmt(v){
    if (typeof v === 'string') return v;
    if (v instanceof Error) return (v.stack || v.message || String(v));
    try { return JSON.stringify(v, null, 2); } catch(e){ return String(v); }
  }
  ['log','info','warn','error','debug'].forEach(function(k){
    var orig = console[k] ? console[k].bind(console) : function(){};
    console[k] = function(){
      var args = Array.prototype.slice.call(arguments);
      logs.push(args.map(fmt).join(' '));
      try { orig.apply(null, args); } catch(e){}
    };
  });
  function send(type, payload){
    parent.postMessage({ __sbx: NONCE, type: type, payload: payload }, '*');
  }
  window.onerror = function(msg){ send('error', { logs: logs, error: String(msg) }); return true; };
  (async function(){
    try {
      var __result = await (async function(){
${safeCode}
      })();
      send('done', { logs: logs, result: __result === undefined ? undefined : fmt(__result) });
    } catch (e) {
      send('error', { logs: logs, error: (e && (e.stack || e.message)) || String(e) });
    }
  })();
})();
<\/script></body></html>`;

    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "absolute";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.left = "-9999px";

    let settled = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
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
      const payload = data.payload || {};
      if (data.type === "done") {
        finish({ logs: payload.logs || [], result: payload.result });
      } else if (data.type === "error") {
        finish({ logs: payload.logs || [], error: payload.error });
      }
    };

    const timer = setTimeout(
      () => finish({ logs: [], timedOut: true, error: `Execution timed out after ${TIMEOUT_MS / 1000}s.` }),
      TIMEOUT_MS
    );

    window.addEventListener("message", onMessage);
    iframe.srcdoc = srcdoc;
    document.body.appendChild(iframe);
  });
}
