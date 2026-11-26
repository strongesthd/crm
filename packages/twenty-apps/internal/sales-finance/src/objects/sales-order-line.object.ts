import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SALES_ORDER_LINE_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  SALES_ORDER_LINE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: SALES_ORDER_LINE_UNIVERSAL_IDENTIFIER,
  nameSingular: 'salesOrderLine',
  namePlural: 'salesOrderLines',
  labelSingular: 'Chi tiết đơn hàng',
  labelPlural: 'Chi tiết đơn hàng',
  description: 'Một sản phẩm hoặc dịch vụ trong đơn bán hàng.',
  icon: 'IconListDetails',
  labelIdentifierFieldMetadataUniversalIdentifier:
    SALES_ORDER_LINE_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: SALES_ORDER_LINE_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Mô tả dòng hàng',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000231',
      type: FieldType.NUMBER,
      name: 'quantity',
      label: 'Số lượng',
      icon: 'IconNumbers',
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000232',
      type: FieldType.CURRENCY,
      name: 'unitPrice',
      label: 'Đơn giá',
      icon: 'IconCreditCard',
      isNullable: true,
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000233',
      type: FieldType.CURRENCY,
      name: 'lineTotal',
      label: 'Thành tiền',
      icon: 'IconCreditCard',
      isNullable: true,
    },
  ],
});
