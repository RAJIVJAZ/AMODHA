"use client";

import { useState } from "react";

export type PlannerRecipe = {
  id: string;
  version: number;
  status: string;
  standard_output_qty: number;
  lines: { name: string; unit: string; qty: number }[];
};
export type PlannerProduct = { id: string; name: string; unit: string; recipes: PlannerRecipe[] };

const fieldClass = "w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none";

/** Product, recipe version and planned quantity, with the scaled material requirement shown live. */
export function BatchPlanner({ products }: { products: PlannerProduct[] }) {
  const [productId, setProductId] = useState("");
  const [recipeId, setRecipeId] = useState("");
  const [planned, setPlanned] = useState("");
  const product = products.find((p) => p.id === productId);
  const recipe = product?.recipes.find((r) => r.id === recipeId) ?? product?.recipes.find((r) => r.status === "active");
  const factor = recipe && Number(planned) > 0 ? Number(planned) / recipe.standard_output_qty : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Product</span>
          <select
            name="p_product_id"
            required
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setRecipeId("");
            }}
            className={fieldClass}
          >
            <option value="">Choose…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.recipes.some((r) => r.status === "active")}>
                {p.name}
                {p.recipes.some((r) => r.status === "active") ? "" : " (no approved recipe)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Recipe version</span>
          <select name="p_recipe_id" value={recipeId} onChange={(e) => setRecipeId(e.target.value)} className={fieldClass}>
            <option value="">Current approved version</option>
            {product?.recipes
              .filter((r) => r.status !== "draft")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  v{r.version} {r.status === "active" ? "(current)" : "(retired)"}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Planned quantity{product ? ` (${product.unit})` : ""}</span>
          <input
            name="p_planned_qty#num"
            required
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            className={fieldClass}
          />
        </label>
      </div>
      {recipe ? (
        <div className="rounded-xl bg-blush/50 p-3 text-sm">
          <p className="mb-2 font-semibold text-ink">
            Standard quantities for this plan (recipe v{recipe.version}: {recipe.standard_output_qty} {product?.unit} standard batch
            {factor ? ` × ${factor.toFixed(3).replace(/\.?0+$/, "")}` : ""})
          </p>
          <table className="w-full text-left">
            <tbody>
              {recipe.lines.map((l) => (
                <tr key={l.name} className="border-t border-ink/10">
                  <td className="py-1">{l.name}</td>
                  <td className="py-1 text-right tabular-nums">
                    {factor ? `${(l.qty * factor).toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${l.unit}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-dark/60">These are the planned quantities. Actual use is recorded as material is issued.</p>
        </div>
      ) : null}
    </div>
  );
}
