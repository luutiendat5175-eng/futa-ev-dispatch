export type DepotOptionRow={depotId:string|null;depotName:string;chargingStation:string};
export function rosterDepotOptions(rows:DepotOptionRow[],station:string){
  const options=new Map<string,{id:string;name:string}>();
  for(const row of rows){if(row.depotId&&(!station||row.chargingStation===station))options.set(row.depotId,{id:row.depotId,name:row.depotName});}
  return [...options.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi'));
}
