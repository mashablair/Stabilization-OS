import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { seedDatabase, transitionDuePendingTasks } from "./db.ts";

async function init() {
  await seedDatabase();
  const transitioned = await transitionDuePendingTasks();
  if (transitioned > 0) {
    console.log(`${transitioned} task(s) became actionable.`);
  }
}

init()
  .then(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  })
  .catch((err) => {
    document.getElementById("root")!.innerHTML = `
      <div style="padding: 2rem; font-family: sans-serif; max-width: 600px;">
        <h1 style="color: #dc2626;">Balance OS failed to load</h1>
        <p style="color: #525252;">${err instanceof Error ? err.message : String(err)}</p>
        <p style="color: #737373; font-size: 0.875rem;">Check the browser console for details.</p>
      </div>
    `;
    throw err;
  });
