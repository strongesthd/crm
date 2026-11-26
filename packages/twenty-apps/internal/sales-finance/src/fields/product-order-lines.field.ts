import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  PRODUCT_ORDER_LINES_FIELD_UNIVERSAL_IDENTIFIER,
  PRODUCT_UNIVERSAL_IDENTIFIER,
  SALES_ORDER_LINES_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER,
  SALES_ORDER_LINE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: PRODUCT_ORDER_LINES_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: PRODUCT_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'salesOrderLines',
  label: 'Đơn hàng liên quan',
  icon: 'IconShoppingCart',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    SALES_ORDER_LINE_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    SALES_ORDER_LINES_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
    onDelete: OnDeleteAction.SET_NULL,
  },
});
