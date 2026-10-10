import { dairyProducts } from "@/data/dairy-products";
import { getSweet } from "@/data/sweets";

/** Everything customers can put in the cart: the sweets, and the dairy products already in the shop. */
export function getShopPack(slug: string, packLabel: string) {
  const sweet = getSweet(slug);
  if (sweet) {
    const pack = sweet.packSizes.find((size) => size.label === packLabel);
    return pack ? { productName: sweet.name, pack } : undefined;
  }
  const dairy = dairyProducts.find((product) => product.slug === slug && product.inShop);
  const pack = dairy?.packSizes.find((size) => size.label === packLabel && size.purchasable);
  return dairy && pack ? { productName: dairy.name, pack } : undefined;
}
