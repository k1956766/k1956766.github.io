// 주소에 #연구 가 붙어 들어왔을 때, 그림이 늦게 불러와져 위치가 밀리는 것을 바로잡는다.
(function () {
  if (!location.hash) return;
  var id = decodeURIComponent(location.hash.slice(1));
  function jump() {
    var el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: "start" });
  }
  // 위쪽 그림을 먼저 불러와 높이를 확정
  document.addEventListener("DOMContentLoaded", function () {
    var target = document.getElementById(id);
    if (!target) return;
    document.querySelectorAll("img[loading=lazy]").forEach(function (img) {
      if (img.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) img.loading = "eager";
    });
    jump();
  });
  window.addEventListener("load", function () { jump(); setTimeout(jump, 300); });
})();
