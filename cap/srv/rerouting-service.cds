using rerouting from '../db/schema';

@path: '/odata/v4/rerouting'
service ReroutingService {
  entity Assets         as projection on rerouting.Assets;
  entity PurchaseOrders as projection on rerouting.PurchaseOrders;
  entity Incidents      as projection on rerouting.Incidents;
  @readonly entity OrderHistory as projection on rerouting.OrderHistory;
  @readonly entity EventStats   as projection on rerouting.EventStats;
  @readonly entity EventLog     as projection on rerouting.EventLog;
  /** Reroute orders for the Captain / Driver deck app. Created by dispatchPlan, answered with reply(). */
  @readonly entity Dispatches   as projection on rerouting.Dispatches;

  /** Agent 2 · classifier. SAP AI Core (Generative AI Hub orchestration) when bound; rule engine (app/rerouting-rules.js) as fallback. */
  type Classification {
    event_type : String;
    severity   : String;
    location   : String;
    lat        : Decimal(9,5);
    lon        : Decimal(9,5);
    confidence : Decimal(4,2);
    action     : String;
    engine     : String;   // 'SAP AI Core · <model>' or 'rules …'
    note       : String;
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
    ordersSent : Integer;
  }
  type CrewOrder {
    asset_ID    : String(10);
    routeName   : String(80);
    instruction : String(300);
    newEta      : Timestamp;
  }
  action dispatchPlan(incident : Incidents, updates : many ETAUpdate, source : String, orders : many CrewOrder) returns DispatchResult;

  /** Captain / driver answers a reroute order. */
  action reply(ID : UUID, status : String, note : String) returns Dispatches;

  /** Demo support: restore seed data and re-anchor due dates and ETAs to now. */
  type Info {
    version    : String;
    startedAt  : Timestamp;
    anchoredAt : Timestamp;
    db         : String;
    messaging  : String;
    auth       : String;
    classifier : String;
    aiCore     : String;
    runtime    : String;
  }
  function info() returns Info;
  action resetDemo() returns Info;
}
