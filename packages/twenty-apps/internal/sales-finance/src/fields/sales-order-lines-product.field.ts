import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  PRODUCT_UNIVERSAL_IDENTIFIER,
  SALES_ORDER_LINES_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER,
  SALES_ORDER_LINE_UNIVERSAL_IDENTIFIER,
  PRODUCT_ORDER_LINES_FIELD_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: SALES_ORDER_LINES_PRODUCT_FIELD_UNIVERSAL_IDENTIFIER,
  objectUniversalIdentifier: SALES_ORDER_LINE_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'product',
  label: 'Sản phẩm/dịch vụ',
  icon: 'IconPackage',
  isNullable: true,
  relationTargetObjectMetadataUniversalIdentifier:
    PRODUCT_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    PRODUCT_ORDER_LINES_FIELD_UNIVERSAL_IDENTIFIER,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'productId',
  },
});
