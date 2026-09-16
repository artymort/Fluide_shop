import { randomBytes } from "node:crypto";
import { loadConfig } from "../config.js";
import { createPool } from "../db.js";
import { hashAdminPassword } from "../security/admin-auth.js";

const argument = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim() || "";
};

const email = argument("email").toLowerCase();
const displayName = argument("name") || "Владелец FLUIDE";
const role = argument("role") || "owner";

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("Укажите email: --email=owner@example.ru");
}
if (!new Set(["owner", "admin", "editor", "orders", "analyst"]).has(role)) {
  throw new Error("Недопустимая роль");
}

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
const bytes = randomBytes(22);
const password = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
const passwordHash = hashAdminPassword(password);
const config = loadConfig();
const pool = createPool(config.database);

try {
  const result = await pool.query(
    `INSERT INTO admin_users (email, display_name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       status = 'active'
     RETURNING id, email, display_name, role`,
    [email, displayName.slice(0, 120), passwordHash, role],
  );
  console.log("Администратор CMS создан или обновлён:");
  console.log(`Email: ${result.rows[0].email}`);
  console.log(`Роль: ${result.rows[0].role}`);
  console.log(`Начальный пароль: ${password}`);
  console.log("Пароль показывается только в этом выводе. Сохраните его в менеджере паролей.");
} finally {
  await pool.end();
}
