import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  PRODUCT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  PRODUCT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: PRODUCT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'product',
  namePlural: 'products',
  labelSingular: 'Sản phẩm',
  labelPlural: 'Sản phẩm',
  description: 'Sản phẩm hoặc dịch vụ được bán.',
  icon: 'IconPackage',
  labelIdentifierFieldMetadataUniversalIdentifier:
    PRODUCT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: PRODUCT_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Tên sản phẩm/dịch vụ',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000211',
      type: FieldType.TEXT,
      name: 'sku',
      label: 'Mã SKU',
      icon: 'IconBarcode',
      isNullable: true,
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000212',
      type: FieldType.SELECT,
      name: 'itemType',
      label: 'Loại',
      icon: 'IconCategory',
      defaultValue: "'PRODUCT'",
      options: [
        {
          id: 'f1ab2000-0000-4000-8000-000000000901',
          value: 'PRODUCT',
          label: 'Hàng hóa',
          position: 0,
          color: 'blue',
        },
        {
          id: 'f1ab2000-0000-4000-8000-000000000902',
          value: 'SERVICE',
          label: 'Dịch vụ',
          position: 1,
          color: 'purple',
        },
      ],
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000213',
      type: FieldType.TEXT,
      name: 'unit',
      label: 'Đơn vị tính',
      icon: 'IconRuler',
      isNullable: true,
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000214',
      type: FieldType.CURRENCY,
      name: 'salesPrice',
      label: 'Giá bán',
      icon: 'IconCreditCard',
      isNullable: true,
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000215',
      type: FieldType.CURRENCY,
      name: 'costPrice',
      label: 'Giá vốn',
      icon: 'IconCreditCard',
      isNullable: true,
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000216',
      type: FieldType.NUMBER,
      name: 'quantityOnHand',
      label: 'Số lượng hiện có',
      description: 'Cập nhật thủ công sau mỗi lần nhập, xuất hoặc kiểm kê.',
      icon: 'IconNumbers',
      isNullable: true,
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000218',
      type: FieldType.NUMBER,
      name: 'reorderPoint',
      label: 'Ngưỡng cần nhập thêm',
      icon: 'IconBellRinging',
      isNullable: true,
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000217',
      type: FieldType.BOOLEAN,
      name: 'isActive',
      label: 'Đang kinh doanh',
      icon: 'IconCheck',
      defaultValue: true,
    },
  ],
});
