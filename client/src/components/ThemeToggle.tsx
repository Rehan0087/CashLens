import { useApp } from "../state";

/** A compact, persistent light/dark mode switch shared by both app shells. */
export function ThemeToggle() {
  const { theme, setTheme, t } = useApp();
  const isDark = theme === "dark";
  const nextTheme = isDark ? "light" : "dark";

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={isDark ? t("switchToLight") : t("switchToDark")}
      aria-pressed={isDark}
      title={isDark ? t("switchToLight") : t("switchToDark")}
      onClick={() => setTheme(nextTheme)}
    >
      <span aria-hidden="true" className="theme-toggle-scene">
        <span className="theme-toggle-sun" />
        <span className="theme-toggle-moon" />
        <span className="theme-toggle-spark theme-toggle-spark-one" />
        <span className="theme-toggle-spark theme-toggle-spark-two" />
      </span>
      <span className="theme-toggle-label">{isDark ? t("lightMode") : t("darkMode")}</span>
    </button>
  );
}
