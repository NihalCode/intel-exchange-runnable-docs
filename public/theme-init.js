(function () {
  try {
    var s = localStorage.getItem("theme");
    // Living Signal Atlas is dark-first; only force light when explicitly chosen.
    var d = s ? s === "dark" : s === "light" ? false : true;
    if (d) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  } catch {
    document.documentElement.classList.add("dark");
  }
})();
