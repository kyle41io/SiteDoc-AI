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
};

const en: AuditStrings = {
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
};

const vi: AuditStrings = {
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
};

const es: AuditStrings = {
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
};

const zh: AuditStrings = {
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
};

const ja: AuditStrings = {
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
};

const AUDIT_STRINGS: Record<Locale, AuditStrings> = { en, vi, es, zh, ja };

/** Resolve audit strings for a locale, defaulting to English. */
export function auditStrings(locale: string | undefined): AuditStrings {
  return isLocale(locale) ? AUDIT_STRINGS[locale] : AUDIT_STRINGS.en;
}
