import { FAQ } from "@/content/faq";
import { CARE } from "@/content/care";
import { CONTACT } from "@/content/contact";
import { POLICIES } from "@/content/policies";
import { PRODUCT, COLOURS } from "./product";
import { BASE_PRICE } from "./pricing";
import { bundleSubtotal, bundleDeliveredSaving, formatMoney, lineTotal, shippingFee, SHIPPING_OPTIONS } from "./pricing";
import { PREORDER_MODE, PREORDER_COPY, REGULAR_PRICE } from "./salesMode";
import type { Availability } from "./preorders";

/** Reference material, never prewritten answers. Rebuilt for each question. */
export function hatKnowledge(availability: Availability | null) {
  return {
    product: {
      name: PRODUCT.name,
      material: PRODUCT.tagline,
      colours: COLOURS.map(colour => PRODUCT.variants[colour].name),
      embroidery: '"Smelt" on the front and "Warm regards" on the back.',
      faq: FAQ.filter(item => !/ship|fit|look after|love it/i.test(item.q)),
    },
    fit: FAQ.filter(item => /fit/i.test(item.q)),
    care: { steps: CARE.steps, donts: CARE.donts, note: CARE.note },
    pricing: {
      currency: "ZAR",
      pricePerHat: formatMoney(BASE_PRICE),
      twoHats: formatMoney(lineTotal(2)),
      threeHats: formatMoney(bundleSubtotal(3)),
      fourHats: formatMoney(bundleSubtotal(4)),
      threeHatDeliveredSaving: formatMoney(bundleDeliveredSaving(3)),
      fourHatDeliveredSaving: formatMoney(bundleDeliveredSaving(4)),
      bundleRule: "Any green/cream combination. Three and four hats include free express delivery. Savings compare full item prices plus R90 delivery. Four hats are best value. Larger carts use four-hat packs, then a three-hat pack if possible, with remaining hats at the single price.",
      twoHatDiscount: "The two-hat bundle has no item discount and includes free express delivery.",
      oneHatExpressDelivery: formatMoney(shippingFee(BASE_PRICE)),
      twoHatExpressDelivery: formatMoney(shippingFee(lineTotal(2))),
      preorderMode: PREORDER_MODE,
      ...(PREORDER_MODE ? { regularPriceAfterRestock: formatMoney(REGULAR_PRICE), timing: PREORDER_COPY } : {}),
    },
    shipping: {
      ...POLICIES.shipping,
      methods: Object.entries(SHIPPING_OPTIONS).map(([id, option]) => ({
        ...option,
        feeForOneHat: formatMoney(shippingFee(BASE_PRICE, id as "aramex" | "founders")),
        feeForTwoHats: formatMoney(shippingFee(lineTotal(2), id as "aramex" | "founders")),
      })),
      ...(PREORDER_MODE ? { currentTiming: PREORDER_COPY, rule: "Pre-order arrival is an estimate. Delivery follows arrival; next-business-day delivery is not a promise for pre-orders." } : {}),
    },
    availability: availability ? {
      checkedAt: new Date().toISOString(),
      green: { inStock: availability.green, preorderPlaces: availability.preorder.green },
      cream: { inStock: availability.cream, preorderPlaces: availability.preorder.cream },
      timing: availability.timing,
      rule: "Availability is a snapshot and can change before checkout. These counts exclude existing checkout holds.",
    } : { status: "Could not verify current availability. Do not claim a colour is in stock or available for pre-order; ask the customer to check the colour options or contact Smelt." },
    returns: POLICIES.returns,
    contact: {
      intro: CONTACT.intro,
      methods: CONTACT.methods.filter(method => method.label === "General enquiries" || method.label === "Returns" || method.label === "Phone"),
    },
  };
}
