import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./i18n";
import "./index.css";
import { installGlobalErrorReporter } from "./lib/errorReporter";

installGlobalErrorReporter();

createRoot(document.getElementById("root")!).render(<App />);
