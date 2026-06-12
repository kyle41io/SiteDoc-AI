import { isLocale, type Locale } from "@/i18n/config";

/**
 * Server-side localized strings for deterministic audit content (summaries,
 * issue titles/fixes, metric labels). Kept separate from the UI dictionaries
 * because this text is generated in the scanner/API, not the React tree.
 */
export type AuditStrings = {
  summaryClean: (seconds: string) => string;
  summaryIssues: (consoleCount: number, networkCount: number) => string;
  consoleIssueTitle: string;
  consoleIssueFix: string;
  networkIssueTitleStatus: (status: number) => string;
  networkIssueTitleFailed: string;
  networkIssueFix: string;
  /** Suffix appended to an accessibility issue detail, e.g. "Affected elements: 3." */
  a11yAffected: (count: number) => string;
  metricScanDurationLabel: string;
  metricScanDurationDetail: string;
  metricConsoleErrorsLabel: string;
  metricConsoleErrorsDetail: string;
  metricFailedRequestsLabel: string;
  metricFailedRequestsDetail: string;
  metricFinalUrlLabel: string;
  runningSummary: string;
  failedSummary: string;
  seo: SeoStrings;
  performance: PerformanceStrings;
  ai: AiStrings;
};

/**
 * Strings for the AI remediation layer. `languageName` tells the AI provider
 * which language to write in; the `fallback*` templates produce a deterministic
 * report when the AI provider is unavailable (no key, error, or timeout).
 */
export type AiStrings = {
  languageName: string;
  fallbackSummaryClean: (url: string, overall: number) => string;
  fallbackSummaryIssues: (url: string, overall: number, issues: number) => string;
  fallbackNoIssues: string;
};

export type PerformanceStrings = {
  slowLoad: (seconds: string) => string;
  slowLoadFix: string;
  slowTtfb: (ms: number) => string;
  slowTtfbFix: string;
  heavyPage: (mb: string) => string;
  heavyPageFix: string;
  tooManyRequests: (count: number) => string;
  tooManyRequestsFix: string;
  heavyImages: (mb: string) => string;
  heavyImagesFix: string;
  renderBlocking: (count: number) => string;
  renderBlockingFix: string;
};

export type SeoStrings = {
  titleMissing: string;
  titleMissingFix: string;
  descriptionMissing: string;
  descriptionMissingFix: string;
  h1Missing: string;
  h1MissingFix: string;
  h1Multiple: string;
  h1MultipleFix: string;
  canonicalMissing: string;
  canonicalMissingFix: string;
  openGraph: string;
  openGraphFix: string;
  langMissing: string;
  langMissingFix: string;
  viewportMissing: string;
  viewportMissingFix: string;
  noindex: string;
  noindexFix: string;
  imageAlt: (covered: number, total: number) => string;
  imageAltFix: string;
};

const en: AuditStrings = {
  ai: {
    languageName: "English",
    fallbackSummaryClean: (url, overall) =>
      `${url} scored ${overall}/100 in this automated audit. No blocking accessibility, SEO, performance, or runtime issues were detected.`,
    fallbackSummaryIssues: (url, overall, n) =>
      `${url} scored ${overall}/100 in this automated audit. ${n} issue${n === 1 ? "" : "s"} were found across accessibility, SEO, performance, and runtime checks — the highest-impact ones are listed below.`,
    fallbackNoIssues:
      "No blocking issues were found. Keep monitoring with periodic audits as the site changes.",
  },
  summaryClean: (s) =>
    `The page loaded successfully in ${s}s with no console errors or failed network requests detected during the scan.`,
  summaryIssues: (c, n) =>
    `The scanner captured ${c} console error${c === 1 ? "" : "s"} and ${n} failed network request${n === 1 ? "" : "s"}. Prioritize high-impact client errors and failed critical resources before deeper UX or SEO review.`,
  consoleIssueTitle: "Browser console error detected",
  consoleIssueFix:
    "Inspect the browser console stack trace, fix the failing client-side code, and add regression coverage for the affected UI flow.",
  networkIssueTitleStatus: (status) => `Request returned HTTP ${status}`,
  networkIssueTitleFailed: "Network request failed",
  networkIssueFix:
    "Confirm the resource URL, server status, deployment configuration, CORS policy, and retry/error handling for this request.",
  a11yAffected: (n) => `Affected elements: ${n}.`,
  metricScanDurationLabel: "Scan duration",
  metricScanDurationDetail:
    "Time spent launching Chromium, loading the page, and capturing screenshots.",
  metricConsoleErrorsLabel: "Console errors",
  metricConsoleErrorsDetail:
    "Browser console messages with error severity from the desktop scan.",
  metricFailedRequestsLabel: "Failed requests",
  metricFailedRequestsDetail:
    "Network failures and HTTP 4xx/5xx responses observed during page load.",
  metricFinalUrlLabel: "Final URL",
  runningSummary: "Scanner is running.",
  failedSummary:
    "The scanner could not complete this audit. Check the URL, site availability, TLS configuration, and browser runtime logs.",
  seo: {
    titleMissing: "Missing page title",
    titleMissingFix:
      "Add a unique, descriptive <title> (around 50–60 characters) summarizing the page.",
    descriptionMissing: "Missing meta description",
    descriptionMissingFix:
      "Add a <meta name=\"description\"> (~150 characters) so search engines can summarize the page.",
    h1Missing: "No H1 heading",
    h1MissingFix: "Add a single, descriptive <h1> stating the page's main topic.",
    h1Multiple: "Multiple H1 headings",
    h1MultipleFix: "Use exactly one <h1> per page; demote the rest to <h2>/<h3>.",
    canonicalMissing: "Missing canonical link",
    canonicalMissingFix:
      "Add <link rel=\"canonical\"> to consolidate duplicate URLs and avoid split ranking signals.",
    openGraph: "Incomplete Open Graph tags",
    openGraphFix:
      "Add og:title, og:description, and og:image so shared links render rich previews.",
    langMissing: "Missing html lang attribute",
    langMissingFix:
      "Set <html lang=\"…\"> so assistive tech and search engines detect the page language.",
    viewportMissing: "Missing viewport meta",
    viewportMissingFix:
      "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> for mobile rendering.",
    noindex: "Page blocked from search indexing",
    noindexFix:
      "Remove the noindex directive if this page should appear in search results.",
    imageAlt: (covered, total) => `Image alt coverage: ${covered}/${total}`,
    imageAltFix:
      "Add descriptive alt text to every meaningful <img>; use empty alt for decorative images.",
  },
  performance: {
    slowLoad: (s) => `Slow page load: ${s}s`,
    slowLoadFix:
      "Defer non-critical JS, compress assets, and lazy-load below-the-fold content to cut load time.",
    slowTtfb: (ms) => `Slow server response (TTFB ${ms}ms)`,
    slowTtfbFix:
      "Reduce server processing, enable caching/CDN, and minimize redirects to lower time to first byte.",
    heavyPage: (mb) => `Large page weight: ${mb} MB transferred`,
    heavyPageFix:
      "Compress images, minify and split bundles, and remove unused code to shrink total transfer.",
    tooManyRequests: (n) => `High request count: ${n} requests`,
    tooManyRequestsFix:
      "Bundle assets, inline small resources, and trim third-party scripts to reduce round-trips.",
    heavyImages: (mb) => `Heavy images: ${mb} MB`,
    heavyImagesFix:
      "Serve responsive sizes in modern formats (WebP/AVIF) and lazy-load offscreen images.",
    renderBlocking: (n) => `Render-blocking stylesheets: ${n}`,
    renderBlockingFix:
      "Inline critical CSS and load the rest asynchronously so first paint isn't blocked.",
  },
};

const vi: AuditStrings = {
  ai: {
    languageName: "Vietnamese",
    fallbackSummaryClean: (url, overall) =>
      `${url} đạt ${overall}/100 trong lần kiểm tra tự động này. Không phát hiện vấn đề nghiêm trọng nào về khả năng truy cập, SEO, hiệu năng hay lỗi runtime.`,
    fallbackSummaryIssues: (url, overall, n) =>
      `${url} đạt ${overall}/100 trong lần kiểm tra tự động này. Đã phát hiện ${n} vấn đề về khả năng truy cập, SEO, hiệu năng và runtime — những vấn đề tác động lớn nhất được liệt kê bên dưới.`,
    fallbackNoIssues:
      "Không phát hiện vấn đề nghiêm trọng nào. Hãy tiếp tục kiểm tra định kỳ khi trang web thay đổi.",
  },
  summaryClean: (s) =>
    `Trang đã tải thành công trong ${s}s, không phát hiện lỗi console hay yêu cầu mạng thất bại nào trong quá trình quét.`,
  summaryIssues: (c, n) =>
    `Trình quét ghi nhận ${c} lỗi console và ${n} yêu cầu mạng thất bại. Hãy ưu tiên các lỗi phía client nghiêm trọng và tài nguyên quan trọng bị lỗi trước khi xem xét sâu hơn về UX hay SEO.`,
  consoleIssueTitle: "Phát hiện lỗi console của trình duyệt",
  consoleIssueFix:
    "Kiểm tra stack trace trong console, sửa mã phía client bị lỗi và bổ sung kiểm thử hồi quy cho luồng giao diện bị ảnh hưởng.",
  networkIssueTitleStatus: (status) => `Yêu cầu trả về HTTP ${status}`,
  networkIssueTitleFailed: "Yêu cầu mạng thất bại",
  networkIssueFix:
    "Xác minh URL tài nguyên, trạng thái máy chủ, cấu hình triển khai, chính sách CORS và cơ chế thử lại/xử lý lỗi cho yêu cầu này.",
  a11yAffected: (n) => `Số phần tử bị ảnh hưởng: ${n}.`,
  metricScanDurationLabel: "Thời lượng quét",
  metricScanDurationDetail:
    "Thời gian khởi chạy Chromium, tải trang và chụp màn hình.",
  metricConsoleErrorsLabel: "Lỗi console",
  metricConsoleErrorsDetail:
    "Các thông báo console mức lỗi từ lần quét máy tính.",
  metricFailedRequestsLabel: "Yêu cầu thất bại",
  metricFailedRequestsDetail:
    "Các lỗi mạng và phản hồi HTTP 4xx/5xx ghi nhận khi tải trang.",
  metricFinalUrlLabel: "URL cuối cùng",
  runningSummary: "Trình quét đang chạy.",
  failedSummary:
    "Trình quét không thể hoàn tất phân tích này. Hãy kiểm tra URL, tình trạng hoạt động của trang, cấu hình TLS và nhật ký trình duyệt.",
  seo: {
    titleMissing: "Thiếu tiêu đề trang",
    titleMissingFix:
      "Thêm thẻ <title> mô tả, duy nhất (khoảng 50–60 ký tự) tóm tắt nội dung trang.",
    descriptionMissing: "Thiếu meta description",
    descriptionMissingFix:
      "Thêm <meta name=\"description\"> (~150 ký tự) để công cụ tìm kiếm tóm tắt được trang.",
    h1Missing: "Không có tiêu đề H1",
    h1MissingFix: "Thêm một thẻ <h1> mô tả chủ đề chính của trang.",
    h1Multiple: "Có nhiều tiêu đề H1",
    h1MultipleFix: "Mỗi trang chỉ nên có đúng một <h1>; hạ các thẻ còn lại xuống <h2>/<h3>.",
    canonicalMissing: "Thiếu liên kết canonical",
    canonicalMissingFix:
      "Thêm <link rel=\"canonical\"> để hợp nhất các URL trùng lặp và tránh phân tán tín hiệu xếp hạng.",
    openGraph: "Thẻ Open Graph chưa đầy đủ",
    openGraphFix:
      "Thêm og:title, og:description và og:image để liên kết chia sẻ hiển thị bản xem trước phong phú.",
    langMissing: "Thiếu thuộc tính lang trên thẻ html",
    langMissingFix:
      "Đặt <html lang=\"…\"> để công nghệ hỗ trợ và công cụ tìm kiếm nhận diện ngôn ngữ trang.",
    viewportMissing: "Thiếu thẻ meta viewport",
    viewportMissingFix:
      "Thêm <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> để hiển thị tốt trên di động.",
    noindex: "Trang bị chặn lập chỉ mục tìm kiếm",
    noindexFix:
      "Gỡ chỉ thị noindex nếu trang này nên xuất hiện trong kết quả tìm kiếm.",
    imageAlt: (covered, total) => `Độ phủ alt cho ảnh: ${covered}/${total}`,
    imageAltFix:
      "Thêm alt mô tả cho mọi <img> có ý nghĩa; dùng alt rỗng cho ảnh trang trí.",
  },
  performance: {
    slowLoad: (s) => `Trang tải chậm: ${s}s`,
    slowLoadFix:
      "Hoãn JS không quan trọng, nén tài nguyên và tải trễ nội dung dưới màn hình để giảm thời gian tải.",
    slowTtfb: (ms) => `Máy chủ phản hồi chậm (TTFB ${ms}ms)`,
    slowTtfbFix:
      "Giảm xử lý phía máy chủ, bật cache/CDN và hạn chế chuyển hướng để giảm thời gian phản hồi đầu tiên.",
    heavyPage: (mb) => `Trang nặng: đã truyền ${mb} MB`,
    heavyPageFix:
      "Nén ảnh, rút gọn và tách bundle, loại bỏ mã không dùng để giảm tổng dung lượng truyền.",
    tooManyRequests: (n) => `Quá nhiều yêu cầu: ${n} yêu cầu`,
    tooManyRequestsFix:
      "Gộp tài nguyên, nội tuyến tài nguyên nhỏ và loại bỏ script bên thứ ba để giảm số lượt request.",
    heavyImages: (mb) => `Ảnh nặng: ${mb} MB`,
    heavyImagesFix:
      "Phục vụ kích thước phù hợp ở định dạng hiện đại (WebP/AVIF) và tải trễ ảnh ngoài màn hình.",
    renderBlocking: (n) => `CSS chặn hiển thị: ${n}`,
    renderBlockingFix:
      "Nội tuyến CSS quan trọng và tải phần còn lại bất đồng bộ để không chặn lần vẽ đầu tiên.",
  },
};

const es: AuditStrings = {
  ai: {
    languageName: "Spanish",
    fallbackSummaryClean: (url, overall) =>
      `${url} obtuvo ${overall}/100 en esta auditoría automática. No se detectaron problemas críticos de accesibilidad, SEO, rendimiento ni de ejecución.`,
    fallbackSummaryIssues: (url, overall, n) =>
      `${url} obtuvo ${overall}/100 en esta auditoría automática. Se detectaron ${n} problema${n === 1 ? "" : "s"} de accesibilidad, SEO, rendimiento y ejecución; los de mayor impacto se enumeran a continuación.`,
    fallbackNoIssues:
      "No se encontraron problemas críticos. Continúa con auditorías periódicas a medida que el sitio cambie.",
  },
  summaryClean: (s) =>
    `La página se cargó correctamente en ${s}s sin errores de consola ni solicitudes de red fallidas durante el análisis.`,
  summaryIssues: (c, n) =>
    `El escáner detectó ${c} error${c === 1 ? "" : "es"} de consola y ${n} solicitud${n === 1 ? "" : "es"} de red fallida${n === 1 ? "" : "s"}. Prioriza los errores de cliente de alto impacto y los recursos críticos fallidos antes de un análisis más profundo de UX o SEO.`,
  consoleIssueTitle: "Error de consola del navegador detectado",
  consoleIssueFix:
    "Revisa la traza de la consola del navegador, corrige el código de cliente que falla y añade cobertura de regresión para el flujo de interfaz afectado.",
  networkIssueTitleStatus: (status) => `La solicitud devolvió HTTP ${status}`,
  networkIssueTitleFailed: "La solicitud de red falló",
  networkIssueFix:
    "Verifica la URL del recurso, el estado del servidor, la configuración de despliegue, la política CORS y el manejo de reintentos/errores de esta solicitud.",
  a11yAffected: (n) => `Elementos afectados: ${n}.`,
  metricScanDurationLabel: "Duración del análisis",
  metricScanDurationDetail:
    "Tiempo dedicado a iniciar Chromium, cargar la página y capturar las pantallas.",
  metricConsoleErrorsLabel: "Errores de consola",
  metricConsoleErrorsDetail:
    "Mensajes de consola del navegador con severidad de error del análisis de escritorio.",
  metricFailedRequestsLabel: "Solicitudes fallidas",
  metricFailedRequestsDetail:
    "Fallos de red y respuestas HTTP 4xx/5xx observados durante la carga de la página.",
  metricFinalUrlLabel: "URL final",
  runningSummary: "El escáner está en ejecución.",
  failedSummary:
    "El escáner no pudo completar este análisis. Revisa la URL, la disponibilidad del sitio, la configuración TLS y los registros del navegador.",
  seo: {
    titleMissing: "Falta el título de la página",
    titleMissingFix:
      "Añade un <title> único y descriptivo (unos 50–60 caracteres) que resuma la página.",
    descriptionMissing: "Falta la meta descripción",
    descriptionMissingFix:
      "Añade un <meta name=\"description\"> (~150 caracteres) para que los buscadores resuman la página.",
    h1Missing: "Sin encabezado H1",
    h1MissingFix: "Añade un único <h1> descriptivo que indique el tema principal de la página.",
    h1Multiple: "Varios encabezados H1",
    h1MultipleFix: "Usa exactamente un <h1> por página; baja los demás a <h2>/<h3>.",
    canonicalMissing: "Falta el enlace canónico",
    canonicalMissingFix:
      "Añade <link rel=\"canonical\"> para consolidar URLs duplicadas y evitar dividir las señales de posicionamiento.",
    openGraph: "Etiquetas Open Graph incompletas",
    openGraphFix:
      "Añade og:title, og:description y og:image para que los enlaces compartidos muestren vistas previas enriquecidas.",
    langMissing: "Falta el atributo lang en html",
    langMissingFix:
      "Define <html lang=\"…\"> para que la tecnología de asistencia y los buscadores detecten el idioma.",
    viewportMissing: "Falta la meta viewport",
    viewportMissingFix:
      "Añade <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> para el renderizado móvil.",
    noindex: "Página bloqueada para la indexación",
    noindexFix:
      "Quita la directiva noindex si esta página debe aparecer en los resultados de búsqueda.",
    imageAlt: (covered, total) => `Cobertura de alt en imágenes: ${covered}/${total}`,
    imageAltFix:
      "Añade texto alt descriptivo a cada <img> relevante; usa alt vacío para imágenes decorativas.",
  },
  performance: {
    slowLoad: (s) => `Carga lenta de la página: ${s}s`,
    slowLoadFix:
      "Aplaza el JS no crítico, comprime los recursos y carga en diferido el contenido bajo el pliegue para reducir el tiempo de carga.",
    slowTtfb: (ms) => `Respuesta del servidor lenta (TTFB ${ms}ms)`,
    slowTtfbFix:
      "Reduce el procesamiento del servidor, activa caché/CDN y minimiza las redirecciones para bajar el tiempo hasta el primer byte.",
    heavyPage: (mb) => `Página pesada: ${mb} MB transferidos`,
    heavyPageFix:
      "Comprime imágenes, minifica y divide los bundles, y elimina código sin usar para reducir la transferencia total.",
    tooManyRequests: (n) => `Muchas solicitudes: ${n} solicitudes`,
    tooManyRequestsFix:
      "Agrupa recursos, incrusta los pequeños y elimina scripts de terceros para reducir las idas y vueltas.",
    heavyImages: (mb) => `Imágenes pesadas: ${mb} MB`,
    heavyImagesFix:
      "Sirve tamaños adaptables en formatos modernos (WebP/AVIF) y carga en diferido las imágenes fuera de pantalla.",
    renderBlocking: (n) => `Hojas de estilo que bloquean el render: ${n}`,
    renderBlockingFix:
      "Incrusta el CSS crítico y carga el resto de forma asíncrona para no bloquear el primer pintado.",
  },
};

const zh: AuditStrings = {
  ai: {
    languageName: "Chinese (Simplified)",
    fallbackSummaryClean: (url, overall) =>
      `${url} 在本次自动审计中得分 ${overall}/100。未检测到严重的无障碍、SEO、性能或运行时问题。`,
    fallbackSummaryIssues: (url, overall, n) =>
      `${url} 在本次自动审计中得分 ${overall}/100。在无障碍、SEO、性能和运行时检查中共发现 ${n} 个问题，影响最大的列在下方。`,
    fallbackNoIssues: "未发现严重问题。请随着网站更新定期进行审计。",
  },
  summaryClean: (s) =>
    `页面在 ${s}s 内成功加载，扫描期间未检测到控制台错误或失败的网络请求。`,
  summaryIssues: (c, n) =>
    `扫描器捕获到 ${c} 个控制台错误和 ${n} 个失败的网络请求。请先处理高影响的客户端错误和失败的关键资源，再深入审查 UX 或 SEO。`,
  consoleIssueTitle: "检测到浏览器控制台错误",
  consoleIssueFix:
    "查看浏览器控制台堆栈信息，修复出错的客户端代码，并为受影响的界面流程补充回归测试。",
  networkIssueTitleStatus: (status) => `请求返回 HTTP ${status}`,
  networkIssueTitleFailed: "网络请求失败",
  networkIssueFix:
    "请确认资源 URL、服务器状态、部署配置、CORS 策略以及该请求的重试/错误处理。",
  a11yAffected: (n) => `受影响元素：${n} 个。`,
  metricScanDurationLabel: "扫描耗时",
  metricScanDurationDetail: "启动 Chromium、加载页面和截图所花费的时间。",
  metricConsoleErrorsLabel: "控制台错误",
  metricConsoleErrorsDetail: "桌面端扫描中错误级别的浏览器控制台消息。",
  metricFailedRequestsLabel: "失败请求",
  metricFailedRequestsDetail:
    "页面加载期间观察到的网络失败和 HTTP 4xx/5xx 响应。",
  metricFinalUrlLabel: "最终 URL",
  runningSummary: "扫描器正在运行。",
  failedSummary:
    "扫描器无法完成本次审计。请检查 URL、站点可用性、TLS 配置以及浏览器运行日志。",
  seo: {
    titleMissing: "缺少页面标题",
    titleMissingFix: "添加唯一且有描述性的 <title>（约 50–60 个字符）来概括页面内容。",
    descriptionMissing: "缺少 meta description",
    descriptionMissingFix:
      "添加 <meta name=\"description\">（约 150 个字符），便于搜索引擎概括页面。",
    h1Missing: "没有 H1 标题",
    h1MissingFix: "添加一个有描述性的 <h1>，说明页面的主要主题。",
    h1Multiple: "存在多个 H1 标题",
    h1MultipleFix: "每个页面只应有一个 <h1>，将其余降级为 <h2>/<h3>。",
    canonicalMissing: "缺少 canonical 链接",
    canonicalMissingFix:
      "添加 <link rel=\"canonical\"> 以合并重复 URL，避免分散排名信号。",
    openGraph: "Open Graph 标签不完整",
    openGraphFix:
      "添加 og:title、og:description 和 og:image，使分享链接显示丰富预览。",
    langMissing: "html 缺少 lang 属性",
    langMissingFix: "设置 <html lang=\"…\">，便于辅助技术和搜索引擎识别页面语言。",
    viewportMissing: "缺少 viewport meta",
    viewportMissingFix:
      "添加 <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> 以适配移动端渲染。",
    noindex: "页面被禁止搜索索引",
    noindexFix: "如果该页面应出现在搜索结果中，请移除 noindex 指令。",
    imageAlt: (covered, total) => `图片 alt 覆盖率：${covered}/${total}`,
    imageAltFix: "为每个有意义的 <img> 添加描述性 alt；装饰性图片使用空 alt。",
  },
  performance: {
    slowLoad: (s) => `页面加载缓慢：${s}s`,
    slowLoadFix: "延迟加载非关键 JS、压缩资源并对首屏以下内容懒加载，以缩短加载时间。",
    slowTtfb: (ms) => `服务器响应缓慢（TTFB ${ms}ms）`,
    slowTtfbFix: "减少服务器处理、启用缓存/CDN 并尽量减少重定向，以降低首字节时间。",
    heavyPage: (mb) => `页面体积过大：已传输 ${mb} MB`,
    heavyPageFix: "压缩图片、压缩并拆分打包文件、移除未使用代码，以减小总传输量。",
    tooManyRequests: (n) => `请求过多：${n} 个请求`,
    tooManyRequestsFix: "合并资源、内联小资源并移除第三方脚本，以减少往返请求。",
    heavyImages: (mb) => `图片过重：${mb} MB`,
    heavyImagesFix: "以现代格式（WebP/AVIF）提供自适应尺寸，并对屏幕外图片懒加载。",
    renderBlocking: (n) => `阻塞渲染的样式表：${n}`,
    renderBlockingFix: "内联关键 CSS 并异步加载其余部分，避免阻塞首次绘制。",
  },
};

const ja: AuditStrings = {
  ai: {
    languageName: "Japanese",
    fallbackSummaryClean: (url, overall) =>
      `${url} は今回の自動監査で ${overall}/100 でした。アクセシビリティ、SEO、パフォーマンス、実行時の重大な問題は検出されませんでした。`,
    fallbackSummaryIssues: (url, overall, n) =>
      `${url} は今回の自動監査で ${overall}/100 でした。アクセシビリティ、SEO、パフォーマンス、実行時のチェックで ${n} 件の問題が見つかりました。影響の大きいものを以下に示します。`,
    fallbackNoIssues:
      "重大な問題は見つかりませんでした。サイトの更新に合わせて定期的に監査を続けてください。",
  },
  summaryClean: (s) =>
    `ページは ${s}s で正常に読み込まれ、スキャン中にコンソールエラーや失敗したネットワークリクエストは検出されませんでした。`,
  summaryIssues: (c, n) =>
    `スキャナーは ${c} 件のコンソールエラーと ${n} 件の失敗したネットワークリクエストを検出しました。UX や SEO の詳細レビューの前に、影響の大きいクライアントエラーと失敗した重要リソースを優先してください。`,
  consoleIssueTitle: "ブラウザのコンソールエラーを検出",
  consoleIssueFix:
    "ブラウザのコンソールのスタックトレースを確認し、失敗しているクライアントコードを修正し、影響を受ける UI フローに回帰テストを追加してください。",
  networkIssueTitleStatus: (status) => `リクエストが HTTP ${status} を返しました`,
  networkIssueTitleFailed: "ネットワークリクエストが失敗しました",
  networkIssueFix:
    "リソース URL、サーバー状態、デプロイ設定、CORS ポリシー、このリクエストの再試行／エラー処理を確認してください。",
  a11yAffected: (n) => `影響を受ける要素: ${n} 件。`,
  metricScanDurationLabel: "スキャン時間",
  metricScanDurationDetail:
    "Chromium の起動、ページ読み込み、スクリーンショット取得に要した時間。",
  metricConsoleErrorsLabel: "コンソールエラー",
  metricConsoleErrorsDetail:
    "デスクトップスキャンで取得したエラー重大度のコンソールメッセージ。",
  metricFailedRequestsLabel: "失敗リクエスト",
  metricFailedRequestsDetail:
    "ページ読み込み中に観測されたネットワーク失敗と HTTP 4xx/5xx 応答。",
  metricFinalUrlLabel: "最終 URL",
  runningSummary: "スキャナーを実行中です。",
  failedSummary:
    "スキャナーはこの監査を完了できませんでした。URL、サイトの可用性、TLS 設定、ブラウザの実行ログを確認してください。",
  seo: {
    titleMissing: "ページタイトルがありません",
    titleMissingFix:
      "ページを要約する一意で説明的な <title>（およそ 50〜60 文字）を追加してください。",
    descriptionMissing: "メタディスクリプションがありません",
    descriptionMissingFix:
      "検索エンジンがページを要約できるよう <meta name=\"description\">（約 150 文字）を追加してください。",
    h1Missing: "H1 見出しがありません",
    h1MissingFix: "ページの主題を示す説明的な <h1> を 1 つ追加してください。",
    h1Multiple: "H1 見出しが複数あります",
    h1MultipleFix: "1 ページにつき <h1> は 1 つだけにし、残りは <h2>/<h3> に下げてください。",
    canonicalMissing: "canonical リンクがありません",
    canonicalMissingFix:
      "<link rel=\"canonical\"> を追加して重複 URL を統合し、ランキング信号の分散を防いでください。",
    openGraph: "Open Graph タグが不完全です",
    openGraphFix:
      "og:title・og:description・og:image を追加して、共有リンクでリッチプレビューが表示されるようにしてください。",
    langMissing: "html の lang 属性がありません",
    langMissingFix:
      "<html lang=\"…\"> を設定して、支援技術と検索エンジンがページの言語を判別できるようにしてください。",
    viewportMissing: "viewport メタがありません",
    viewportMissingFix:
      "モバイル表示のために <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> を追加してください。",
    noindex: "ページが検索インデックスから除外されています",
    noindexFix: "このページを検索結果に表示すべきなら noindex 指定を削除してください。",
    imageAlt: (covered, total) => `画像の alt 網羅率: ${covered}/${total}`,
    imageAltFix:
      "意味のある <img> すべてに説明的な alt を追加し、装飾画像には空の alt を使用してください。",
  },
  performance: {
    slowLoad: (s) => `ページ読み込みが遅い: ${s}s`,
    slowLoadFix:
      "重要でない JS を遅延し、アセットを圧縮し、ファーストビュー外のコンテンツを遅延読み込みして読み込み時間を短縮してください。",
    slowTtfb: (ms) => `サーバー応答が遅い（TTFB ${ms}ms）`,
    slowTtfbFix:
      "サーバー処理を減らし、キャッシュ/CDN を有効にし、リダイレクトを最小限にして TTFB を短縮してください。",
    heavyPage: (mb) => `ページが重い: ${mb} MB 転送`,
    heavyPageFix:
      "画像を圧縮し、バンドルを最小化・分割し、未使用コードを削除して総転送量を削減してください。",
    tooManyRequests: (n) => `リクエストが多すぎます: ${n} 件`,
    tooManyRequestsFix:
      "アセットをまとめ、小さなリソースをインライン化し、サードパーティスクリプトを削減して往復を減らしてください。",
    heavyImages: (mb) => `画像が重い: ${mb} MB`,
    heavyImagesFix:
      "最新フォーマット（WebP/AVIF）でレスポンシブなサイズを配信し、画面外の画像を遅延読み込みしてください。",
    renderBlocking: (n) => `レンダリングを妨げるスタイルシート: ${n}`,
    renderBlockingFix:
      "重要な CSS をインライン化し、残りを非同期で読み込んで初回描画をブロックしないようにしてください。",
  },
};

const AUDIT_STRINGS: Record<Locale, AuditStrings> = { en, vi, es, zh, ja };

/** Resolve audit strings for a locale, defaulting to English. */
export function auditStrings(locale: string | undefined): AuditStrings {
  return isLocale(locale) ? AUDIT_STRINGS[locale] : AUDIT_STRINGS.en;
}
