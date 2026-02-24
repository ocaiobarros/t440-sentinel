import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import pt from "./locales/pt.json";
import en from "./locales/en.json";
import es from "./locales/es.json";

const savedLang = localStorage.getItem("flowpulse-lang") || "pt-BR";

i18n.use(initReactI18next).init({
  resources: {
    "pt-BR": { translation: pt },
    en: { translation: en },
    es: { translation: es },
  },
  lng: savedLang,
  fallbackLng: "pt-BR",
  interpolation: { escapeValue: false },
});

export default i18n;
