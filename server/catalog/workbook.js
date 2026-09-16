import ExcelJS from "exceljs";
import { slugify } from "./source-catalog.js";

export const CATALOG_COLUMNS = [
  { header: "SKU товара", key: "productSku", width: 18 },
  { header: "SKU варианта", key: "variantSku", width: 22 },
  { header: "Статус", key: "status", width: 14 },
  { header: "Название", key: "name", width: 40 },
  { header: "Тип", key: "productType", width: 20 },
  { header: "Подпись типа", key: "typeLabel", width: 22 },
  { header: "Объём, мл", key: "volumeMl", width: 14 },
  { header: "Цена, ₽", key: "price", width: 14 },
  { header: "Срок изготовления, дней", key: "leadTimeDays", width: 24 },
  { header: "Изображение", key: "imageUrl", width: 44 },
  { header: "Alt изображения", key: "imageAlt", width: 34 },
  { header: "Краткое описание", key: "shortDescription", width: 44 },
  { header: "SEO title", key: "seoTitle", width: 45 },
  { header: "SEO description", key: "seoDescription", width: 55 },
];

export async function createCatalogWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FLUIDE Atelier CMS";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Товары", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 22 },
  });
  sheet.columns = CATALOG_COLUMNS;
  sheet.autoFilter = { from: "A1", to: "N1" };
  const header = sheet.getRow(1);
  header.height = 30;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF434865" } };
  header.alignment = { vertical: "middle" };

  rows.forEach((row) => sheet.addRow(row));
  sheet.getColumn("price").numFmt = "#,##0.00";
  sheet.getColumn("volumeMl").numFmt = "0";
  sheet.getColumn("leadTimeDays").numFmt = "0";
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber % 2 === 0) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F2" } };
    }
  });

  const help = workbook.addWorksheet("Инструкция");
  help.columns = [{ width: 28 }, { width: 90 }];
  help.addRows([
    ["Правило", "Описание"],
    ["SKU товара", "Постоянный уникальный артикул карточки. По нему CMS находит товар при обновлении."],
    ["SKU варианта", "Постоянный уникальный артикул объёма или другого варианта товара."],
    ["Цена", "Число в рублях без символа валюты."],
    ["Статус", "published, draft или archived."],
    ["Изготовление", "Все импортированные ароматы создаются в режиме изготовления после заказа со сроком 1 день."],
    ["Безопасное обновление", "Сначала CMS показывает предварительную проверку. Изменения применяются только после подтверждения."],
  ]);
  help.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  help.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF434865" } };
  help.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });
  return workbook;
}

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "string" ? value.replace(/\s/g, "").replace(",", ".") : value;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
};

export async function parseCatalogWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Товары") || workbook.worksheets[0];
  if (!sheet) throw new Error("workbook_has_no_sheets");

  const headers = new Map();
  sheet.getRow(1).eachCell((cell, columnNumber) => headers.set(text(cell.value), columnNumber));
  const required = ["SKU товара", "SKU варианта", "Название", "Цена, ₽"];
  const missing = required.filter((header) => !headers.has(header));
  if (missing.length) {
    return { rows: [], errors: [{ row: 1, message: `Нет колонок: ${missing.join(", ")}` }] };
  }

  const cell = (row, header) => row.getCell(headers.get(header) || 0).value;
  const rows = [];
  const errors = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const productSku = text(cell(row, "SKU товара"));
    const variantSku = text(cell(row, "SKU варианта"));
    const name = text(cell(row, "Название"));
    const price = number(cell(row, "Цена, ₽"));
    if (!productSku && !variantSku && !name && price === null) return;
    const status = text(cell(row, "Статус")) || "draft";
    const volumeMl = number(cell(row, "Объём, мл"));
    const leadTimeDays = number(cell(row, "Срок изготовления, дней")) ?? 1;
    const rowErrors = [];
    if (!/^[A-Za-z0-9._-]{2,100}$/.test(productSku)) rowErrors.push("некорректный SKU товара");
    if (!/^[A-Za-z0-9._-]{2,100}$/.test(variantSku)) rowErrors.push("некорректный SKU варианта");
    if (!name || name.length > 240) rowErrors.push("некорректное название");
    if (price === null || price < 0) rowErrors.push("некорректная цена");
    if (!["published", "draft", "archived"].includes(status)) rowErrors.push("некорректный статус");
    if (volumeMl !== null && (!Number.isInteger(volumeMl) || volumeMl <= 0)) rowErrors.push("некорректный объём");
    if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 365) rowErrors.push("некорректный срок изготовления");
    if (rowErrors.length) {
      errors.push({ row: rowNumber, message: rowErrors.join(", ") });
      return;
    }
    rows.push({
      rowNumber,
      productSku,
      variantSku,
      status,
      name,
      slug: slugify(name, productSku.toLowerCase()),
      productType: text(cell(row, "Тип")) || "product",
      typeLabel: text(cell(row, "Подпись типа")) || null,
      volumeMl,
      priceMinor: Math.round(price * 100),
      leadTimeDays,
      imageUrl: text(cell(row, "Изображение")) || null,
      imageAlt: text(cell(row, "Alt изображения")) || name,
      shortDescription: text(cell(row, "Краткое описание")) || null,
      seoTitle: text(cell(row, "SEO title")) || null,
      seoDescription: text(cell(row, "SEO description")) || null,
    });
  });
  return { rows, errors };
}
