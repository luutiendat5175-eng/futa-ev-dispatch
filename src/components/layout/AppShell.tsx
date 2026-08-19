'use client';
import { useState } from 'react'; import { Sidebar } from './Sidebar'; import { GpsPermissionGate } from '@/components/gps/GpsPermissionGate';
export function AppShell({children}:{children:React.ReactNode}){const [hidden,setHidden]=useState(false);return <div className={hidden?'app-shell sidebar-hidden':'app-shell'}><Sidebar/><main className="app-content"><button aria-label="Ẩn hoặc hiện menu" className="sidebar-toggle" onClick={()=>setHidden(x=>!x)}>{hidden?'☰':'‹'}</button><GpsPermissionGate/>{children}</main></div>}
