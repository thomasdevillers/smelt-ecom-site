import type { CartState } from '../cartReducer';
import { COLOURS, PRODUCT } from '../product';
import { renderEmail } from './layout';
import { escapeHtml } from './theme';

export function restockConfirmationEmail(quantities: CartState) {
  const selection = COLOURS.filter(colour => quantities[colour] > 0)
    .map(colour => `${quantities[colour]} × ${PRODUCT.variants[colour].name}`).join(' + ');
  return {
    subject: 'You’re on the Smelt waiting list',
    ...renderEmail({
      preheader: 'Available in 3 weeks. You’re on the list.',
      heading: 'You’re on the list.',
      blocks: [
        `<p>${escapeHtml(selection)}</p>`,
        '<p>Available in 3 weeks. We’ll email you when your selection is back.</p>',
        '<p>This doesn’t reserve stock. To leave the list, reply to this email.</p>',
      ],
    }),
  };
}
