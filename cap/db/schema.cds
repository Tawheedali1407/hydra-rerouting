namespace hydra;
using { cuid, managed } from '@sap/cds/common';

/** Vessels, trucks and rescue units tracked by Hydra (AIS / GPS). */
entity Assets {
  key ID          : String(10);
  name            : String(60);
  type            : String(10);   // VESSEL | TRUCK
  info            : String(120);
  lat             : Decimal(9,5);
  lon             : Decimal(9,5);
  heading         : Integer;
  routeSet        : String(10);   // route catalogue key (SAP TM freight lane)
  baseEtaHours    : Decimal(8,2);
  destination     : String(40);
  orders          : Association to many PurchaseOrders on orders.Asset = $self;
}

/** Mirrors S/4HANA A_PurchaseOrderItem + schedule line fields Hydra needs. */
entity PurchaseOrders : managed {
  key PurchaseOrder     : String(10);
  key PurchaseOrderItem : String(5);
  Material              : String(40);
  MaterialText          : String(80);
  Quantity              : Decimal(13,3);
  Unit                  : String(3);
  Plant                 : String(4);
  Supplier              : String(80);
  Asset                 : Association to Assets;
  DeliveryDate          : Timestamp;   // requested (SLA due)
  ConfirmedDelivery     : Timestamp;   // ETA-based confirmation
  DueOffsetHours        : Decimal(8,2); // demo seed only: due = start + offset
  NetValue              : Decimal(15,2);
  Currency              : String(3);
  SLATier               : String(10);  // Gold 0 h | Silver 12 h | Bronze 48 h tolerance
}

entity Incidents : cuid, managed {
  code            : String(20);
  title           : String(120);
  kind            : String(30);
  mode            : String(10);
  severity        : String(10);
  confidence      : Decimal(4,2);
  lat             : Decimal(9,5);
  lon             : Decimal(9,5);
  radiusKm        : Decimal(8,2);
  assets          : String(120);
  chosenRoute     : String(80);
  status          : String(20);
  detectedAt      : Timestamp;
  responseSeconds : Integer;
  posAffected     : Integer;
  posProtected    : Integer;
}

/** Change log written by the service on every PO create / update. */
entity OrderHistory : cuid {
  at                : Timestamp;
  PurchaseOrder     : String(10);
  PurchaseOrderItem : String(5);
  field             : String(30);
  oldValue          : String(80);
  newValue          : String(80);
  source            : String(80);
}

/** Daily sensing volumes per source (raw vs forwarded after Redis dedup). */
entity EventStats {
  key ID    : String(20);
  DaysAgo   : Integer;
  Source    : String(10);
  Raw       : Integer;
  Forwarded : Integer;
}

/** Business events published by the dispatch agent over CAP messaging (local broker in the demo, SAP Event Mesh in production). */
entity EventLog : cuid {
  at      : Timestamp;
  topic   : String(80);
  payload : LargeString;
}
