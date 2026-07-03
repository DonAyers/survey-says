import "@unocss/reset/tailwind.css";
import "uno.css";
import { render } from "solid-js/web";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

render(() => <App />, root);
