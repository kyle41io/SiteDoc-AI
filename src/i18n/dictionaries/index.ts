import type { Locale } from "@/i18n/config";
import { en, type Dictionary } from "@/i18n/dictionaries/en";
import { vi } from "@/i18n/dictionaries/vi";
import { es } from "@/i18n/dictionaries/es";
import { zh } from "@/i18n/dictionaries/zh";
import { ja } from "@/i18n/dictionaries/ja";

export type { Dictionary } from "@/i18n/dictionaries/en";

export const dictionaries: Record<Locale, Dictionary> = { en, vi, es, zh, ja };
