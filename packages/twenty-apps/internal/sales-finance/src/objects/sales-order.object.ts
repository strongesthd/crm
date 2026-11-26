import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  SALES_ORDER_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  SALES_ORDER_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: SALES_ORDER_UNIVERSAL_IDENTIFIER,
  nameSingular: 'salesOrder',
  namePlural: 'salesOrders',
  labelSingular: 'Đơn bán hàng',
  labelPlural: 'Đơn bán hàng',
  description: 'Đơn đặt hàng của khách hàng.',
  icon: 'IconShoppingCart',
  labelIdentifierFieldMetadataUniversalIdentifier:
    SALES_ORDER_NAME_FIELD_UNIVERSAL_IDENTIFIER,
  fields: [
    {
      universalIdentifier: SALES_ORDER_NAME_FIELD_UNIVERSAL_IDENTIFIER,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Mã đơn hàng',
      icon: 'IconHash',
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000221',
      type: FieldType.DATE,
      name: 'orderDate',
      label: 'Ngày đặt hàng',
      icon: 'IconCalendar',
      isNullable: true,
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000222',
      type: FieldType.SELECT,
      name: 'status',
      label: 'Trạng thái',
      icon: 'IconProgress',
      defaultValue: "'DRAFT'",
      options: [
        {
          id: 'f1ab2000-0000-4000-8000-000000000903',
          value: 'DRAFT',
          label: 'Nháp',
          position: 0,
          color: 'gray',
        },
        {
          id: 'f1ab2000-0000-4000-8000-000000000904',
          value: 'CONFIRMED',
          label: 'Đã xác nhận',
          position: 1,
          color: 'blue',
        },
        {
          id: 'f1ab2000-0000-4000-8000-000000000905',
          value: 'FULFILLING',
          label: 'Đang giao',
          position: 2,
          color: 'orange',
        },
        {
          id: 'f1ab2000-0000-4000-8000-000000000906',
          value: 'COMPLETED',
          label: 'Hoàn tất',
          position: 3,
          color: 'green',
        },
        {
          id: 'f1ab2000-0000-4000-8000-000000000907',
          value: 'CANCELLED',
          label: 'Đã hủy',
          position: 4,
          color: 'red',
        },
      ],
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000223',
      type: FieldType.CURRENCY,
      name: 'subtotal',
      label: 'Tiền hàng',
      icon: 'IconCreditCard',
      isNullable: true,
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000224',
      type: FieldType.CURRENCY,
      name: 'taxAmount',
      label: 'Thuế',
      icon: 'IconCreditCard',
      isNullable: true,
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000225',
      type: FieldType.CURRENCY,
      name: 'totalAmount',
      label: 'Tổng cộng',
      icon: 'IconCreditCard',
      isNullable: true,
    },
    {
      universalIdentifier: 'f1ab2000-0000-4000-8000-000000000226',
      type: FieldType.RICH_TEXT,
      name: 'notes',
      label: 'Ghi chú',
      icon: 'IconNotes',
      isNullable: true,
    },
  ],
});
