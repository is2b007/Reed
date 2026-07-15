import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/source-serif-4/400.css";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { App } from "./app.js";

const root = document.getElementById("root");
if (!root) throw new Error("Reed root element is missing");
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
