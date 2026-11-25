import { z } from "zod";
import { categories } from "../data/categories";
import { currencies } from "./currencies";

export const currencySchema = z.enum(currencies);
export const categorySchema = z.enum(categories);
export const yesNoSchema = z.enum(["yes", "no"]);
