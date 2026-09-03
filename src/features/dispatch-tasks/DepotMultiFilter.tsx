'use client';
export function DepotMultiFilter({options,selected,onChange}:{options:{id:string;name:string}[];selected:string[];onChange:(ids:string[])=>void}){
  return <fieldset style={{border:'1px solid #cbd5e1',borderRadius:8,padding:12,margin:'12px 0'}}>
    <legend>Bãi đậu đỗ — chọn nhiều bãi</legend>
    <div style={{display:'flex',flexWrap:'wrap',gap:'12px 24px',alignItems:'center'}}>
      <button type="button" onClick={()=>onChange([])}>Tất cả bãi</button>
      {options.map(option=><label key={option.id} style={{display:'inline-flex',alignItems:'center',gap:6}}><input type="checkbox" checked={selected.includes(option.id)} onChange={event=>onChange(event.target.checked?[...selected,option.id]:selected.filter(id=>id!==option.id))}/>{option.name}</label>)}
    </div><small>{selected.length?`Đang chọn ${selected.length} bãi`:'Đang hiển thị tất cả bãi trong phạm vi được cấp quyền'}</small>
  </fieldset>;
}
