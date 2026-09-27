using hydra from '../db/schema';

@path: '/odata/v4/hydra'
service HydraService {
  entity Assets         as projection on hydra.Assets;
  entity PurchaseOrders as projection on hydra.PurchaseOrders;
  entity Incidents      as projection on hydra.Incidents;
  @readonly entity OrderHistory as projection on hydra.OrderHistory;
  @readonly entity EventStats   as projection on hydra.EventStats;
  @readonly entity EventLog     as projection on hydra.EventLog;

  /** Agent 2 · classifier. Rule engine today (app/hydra-rules.js); SAP AI Core is the production target. */
  type Classification {
    event_type : String;
    severity   : String;
    location   : String;
    lat        : Decimal(9,5);
    lon        : Decimal(9,5);
    confidence : Decimal(4,2);
    action     : String;
    engine     : String;
  }
  function classify(text : String) returns Classification;

  /** Agent 5 · dispatch. One transaction: PO confirmations + change log + incident + business event. */
  type ETAUpdate {
    PurchaseOrder     : String(10);
    PurchaseOrderItem : String(5);
    ConfirmedDelivery : Timestamp;
  }
  type DispatchResult {
    incident   : UUID;
    code       : String;
    posUpdated : Integer;
    changes    : Integer;
    eventId    : UUID;
    topic      : String;
  }
  action dispatchPlan(incident : Incidents, updates : many ETAUpdate, source : String) returns DispatchResult;

  /** Demo support: restore seed data and re-anchor due dates and ETAs to now. */
  type Info {
    version    : String;
    startedAt  : Timestamp;
    anchoredAt : Timestamp;
    db         : String;
    messaging  : String;
    auth       : String;
    classifier : String;
  }
  function info() returns Info;
  action resetDemo() returns Info;
}
