import { createI18n } from "vue-i18n";
import en from "./locales/en.json";
import ru from "./locales/ru.json";

const savedLocale = window.localStorage.getItem("locale");
const locale = savedLocale === "en" ? "en" : "ru";

export const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: "en",
  messages: {
    ru,
    en,
  },
});
