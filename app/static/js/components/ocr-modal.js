import { t, state, fetchJson } from "../helpers.js";
import { addToShoppingList, renderShoppingList } from "./shopping-list.js";
import { toast } from "./toast.js";

export function initReceiptImport() {
  const btn = document.getElementById("receipt-btn");
  const input = document.getElementById("receipt-input");
  const modal = document.getElementById("receipt-modal");
  const tableBody = document.querySelector("#receipt-table tbody");
  const confirm = document.getElementById("receipt-confirm");
  if (!btn || !modal || !input || !tableBody || !confirm) return;
  btn.addEventListener("click", () => {
    modal.showModal();
  });
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (file) handleReceiptUpload(file);
    input.value = "";
  });
  confirm.addEventListener("click", () => {
    const rows = Array.from(tableBody.querySelectorAll("tr"));
    rows.forEach((tr) => {
      const nameInput = tr.querySelector("td:first-child input");
      const qtyInput = tr.querySelector("td:nth-child(2) input");
      const name = nameInput.dataset.key || nameInput.value.trim();
      const qty = parseInt(qtyInput.value) || 1;
      if (name) addToShoppingList(name, qty);
    });
    renderShoppingList();
    modal.close();
    tableBody.innerHTML = "";
    input.value = "";
  });
}

export async function handleReceiptUpload(file) {
  const modal = document.getElementById("receipt-modal");
  const tableBody = document.querySelector("#receipt-table tbody");
  if (!modal || !tableBody || !file) return;
  if (!modal.open) modal.showModal();
  const { default: Tesseract } = await import(
    "https://cdn.jsdelivr.net/npm/tesseract.js@2.1.5/dist/tesseract.esm.min.js"
  );
  const {
    data: { text },
  } = await Tesseract.recognize(
    file,
    state.currentLang === "pl" ? "pol" : "eng",
  );
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);
  let data;
  try {
    data = await fetchJson("/api/ocr-match", {
      method: "POST",
      body: { items: lines },
    });
  } catch (err) {
    toast.error(t("notify_error_title"), err.message);
    return;
  }
  tableBody.innerHTML = "";
  data.forEach((item) => {
    const tr = document.createElement("tr");
    const nameTd = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    const firstMatch = item.matches[0];
    nameInput.value = firstMatch
      ? t(firstMatch.name, "products")
      : item.original;
    if (firstMatch) nameInput.dataset.key = firstMatch.name;
    nameInput.className = "input input-bordered w-full";
    nameTd.appendChild(nameInput);
    tr.appendChild(nameTd);
    const qtyTd = document.createElement("td");
    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "1";
    qtyInput.value = "1";
    qtyInput.className = "input input-bordered w-20";
    qtyTd.appendChild(qtyInput);
    tr.appendChild(qtyTd);
    const statusTd = document.createElement("td");
    if (item.matches.length > 1) {
      const select = document.createElement("select");
      select.className = "select select-bordered w-full";
      item.matches.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.name;
        opt.textContent = t(m.name, "products");
        select.appendChild(opt);
      });
      select.addEventListener("change", () => {
        nameInput.value = t(select.value, "products");
        nameInput.dataset.key = select.value;
      });
      statusTd.appendChild(select);
    } else {
      const span = document.createElement("span");
      span.className =
        "badge " + (item.matches.length ? "badge-success" : "badge-warning");
      span.textContent = item.matches.length
        ? t("ok")
        : t("ocr_not_recognized");
      statusTd.appendChild(span);
    }
    tr.appendChild(statusTd);
    const removeTd = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "text-error";
    removeBtn.innerHTML = '<i class="fa-regular fa-circle-minus"></i>';
    removeBtn.addEventListener("click", () => tr.remove());
    removeTd.appendChild(removeBtn);
    tr.appendChild(removeTd);
    tableBody.appendChild(tr);
  });
}
