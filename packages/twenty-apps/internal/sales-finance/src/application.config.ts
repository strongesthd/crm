import { defineApplication } from 'twenty-sdk/define';

import { APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: 'Quản lý bán hàng & thu chi',
  description:
    'Quản lý sản phẩm, tồn kho, đơn bán hàng, hóa đơn nội bộ và sổ thu chi.',
});
