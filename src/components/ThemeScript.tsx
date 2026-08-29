import { THEME_COLOR, THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Runs before the first paint so a dark-mode user never sees a white flash.
 *
 * It has to be inline and blocking — anything deferred paints first — which
 * means restating what applyTheme() does, since nothing is imported yet. The
 * values it needs are interpolated from src/lib/theme.ts so the two cannot
 * drift apart.
 *
 * The theme-color meta is part of that job: without it a phone in dark mode
 * gets a white status bar above a dark app, which is the single most obvious
 * tell that this is a web page rather than an app.
 */
export function ThemeScript() {
  const script = `
(function(){try{
var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(t!=="light"&&t!=="dark")t="system";
var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
var r=document.documentElement;
r.dataset.theme=d?"dark":"light";
r.style.colorScheme=d?"dark":"light";
var m=document.querySelector('meta[name="theme-color"]');
if(m)m.setAttribute("content",d?${JSON.stringify(THEME_COLOR.dark)}:${JSON.stringify(THEME_COLOR.light)});
}catch(e){}})();`.replace(/\n/g, "");

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
