import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./styles/pixel.css";

const contenedor = document.getElementById("root");
if (!contenedor) {
  throw new Error("No se encontro el elemento #root.");
}

ReactDOM.createRoot(contenedor).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
