using hydra from '../db/schema';

@path: '/odata/v4/hydra'
service HydraService {
  entity Assets         as projection on hydra.Assets;
  entity PurchaseOrders as projection on hydra.PurchaseOrders;
  entity Incidents      as projection on hydra.Incidents;
  @readonly entity OrderHistory as projection on hydra.OrderHistory;
  @readonly entity EventStats   as projection on hydra.EventStats;
}
