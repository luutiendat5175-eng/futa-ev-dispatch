'use client';

import { useRef, useState, type WheelEvent, type MouseEvent } from 'react';

export interface YardLocation {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface YardMapCanvasProps {
  depots: YardLocation[];
  stations: YardLocation[];
  /** kích thước "thế giới" bản đồ - toạ độ x,y của depot/station phải nằm trong khoảng này */
  worldWidth?: number;
  worldHeight?: number;
  onSelectLocation?: (location: YardLocation, kind: 'depot' | 'station') => void;
  locationCounts?: Record<string, { vehicles: number; drivers: number }>;
  movements?: { fromId: string; toId: string; direction: 'outbound' | 'return'; count: number }[];
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MARKER_RADIUS = 10;
const MIN_ZOOM_WIDTH = 100;

/**
 * Digital Yard Map - KHÔNG dùng Google Maps (đúng yêu cầu thiết kế).
 * Vẽ Bãi (depot) và Trạm sạc (station) trên hệ toạ độ (x,y) riêng của hệ thống.
 * Zoom bằng scroll chuột, pan bằng kéo chuột - đơn giản, không phụ thuộc thư viện map ngoài.
 */
export function YardMapCanvas({
  depots,
  stations,
  worldWidth = 1000,
  worldHeight = 700,
  onSelectLocation,
  locationCounts = {},
  movements = [],
}: YardMapCanvasProps) {
  const locations = [...depots, ...stations];
  const xValues = locations.map((location) => location.x);
  const yValues = locations.map((location) => location.y);
  const minX = xValues.length ? Math.min(...xValues) : 0;
  const maxX = xValues.length ? Math.max(...xValues) : 1;
  const minY = yValues.length ? Math.min(...yValues) : 0;
  const maxY = yValues.length ? Math.max(...yValues) : 1;
  const padding = 70;
  const spanX = Math.max(maxX - minX, 0.0001);
  const spanY = Math.max(maxY - minY, 0.0001);
  const toCanvas = (location: YardLocation) => ({
    x: padding + ((location.x - minX) / spanX) * (worldWidth - padding * 2),
    y: worldHeight - padding - ((location.y - minY) / spanY) * (worldHeight - padding * 2),
  });
  const [viewBox, setViewBox] = useState<ViewBox>({
    x: 0,
    y: 0,
    width: worldWidth,
    height: worldHeight,
  });
  const isDragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handleWheel(e: WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    setViewBox((prev) => {
      const newWidth = Math.max(MIN_ZOOM_WIDTH, Math.min(worldWidth * 2, prev.width * zoomFactor));
      const newHeight = newWidth * (prev.height / prev.width);
      return { ...prev, width: newWidth, height: newHeight };
    });
  }

  function handleMouseDown(e: MouseEvent<SVGSVGElement>) {
    isDragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
  }

  function handleMouseMove(e: MouseEvent<SVGSVGElement>) {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };

    setViewBox((prev) => ({
      ...prev,
      x: prev.x - dx * (prev.width / worldWidth),
      y: prev.y - dy * (prev.height / worldHeight),
    }));
  }

  function stopDragging() {
    isDragging.current = false;
  }

  function handleSelect(loc: YardLocation, kind: 'depot' | 'station') {
    setSelectedId(loc.id);
    onSelectLocation?.(loc, kind);
  }

  return (
    <div className="relative w-full h-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
        role="img"
        aria-label="Digital Yard Map"
      >
        <defs>
          <pattern id="yard-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect x={0} y={0} width={worldWidth} height={worldHeight} fill="url(#yard-grid)" />
        {movements.map((movement) => {
          const from = locations.find((x) => x.id === movement.fromId); const to = locations.find((x) => x.id === movement.toId);
          if (!from || !to) return null; const a = toCanvas(from); const b = toCanvas(to); const x = (a.x + b.x) / 2; const y = (a.y + b.y) / 2;
          return <g key={`${movement.fromId}-${movement.toId}-${movement.direction}`}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={movement.direction === 'outbound' ? '#2563eb' : '#ea580c'} strokeWidth={3} strokeDasharray="8 6" opacity=".8"/><text x={x} y={y - 8} textAnchor="middle" className="fill-slate-700 text-[12px]">{movement.direction === 'outbound' ? '→' : '←'} {movement.count} xe</text></g>;
        })}

        {depots.map((depot) => {
          const point = toCanvas(depot);
          return (
          <g
            key={depot.id}
            data-testid="map-marker"
            data-marker-kind="depot"
            transform={`translate(${point.x}, ${point.y})`}
            onClick={() => handleSelect(depot, 'depot')}
            className="cursor-pointer"
          >
            <rect
              x={-MARKER_RADIUS}
              y={-MARKER_RADIUS}
              width={MARKER_RADIUS * 2}
              height={MARKER_RADIUS * 2}
              rx={3}
              className={
                selectedId === depot.id
                  ? 'fill-teal-600 stroke-teal-900'
                  : 'fill-teal-500 stroke-teal-700'
              }
              strokeWidth={1.5}
            />
            <text
              y={MARKER_RADIUS + 14}
              textAnchor="middle"
              className="fill-slate-700 dark:fill-slate-300 text-[11px] select-none"
            >
              {depot.name}
            </text>
            {locationCounts[depot.id] && <text y={-18} textAnchor="middle" className="fill-slate-700 text-[11px]">{locationCounts[depot.id].vehicles} xe · {locationCounts[depot.id].drivers} lái xe</text>}
          </g>
          );
        })}

        {stations.map((station) => {
          const point = toCanvas(station);
          return (
          <g
            key={station.id}
            data-testid="map-marker"
            data-marker-kind="station"
            transform={`translate(${point.x}, ${point.y})`}
            onClick={() => handleSelect(station, 'station')}
            className="cursor-pointer"
          >
            <circle
              r={MARKER_RADIUS}
              className={
                selectedId === station.id
                  ? 'fill-amber-600 stroke-amber-900'
                  : 'fill-amber-500 stroke-amber-700'
              }
              strokeWidth={1.5}
            />
            <text
              y={MARKER_RADIUS + 14}
              textAnchor="middle"
              className="fill-slate-700 dark:fill-slate-300 text-[11px] select-none"
            >
              {station.name}
            </text>
            {locationCounts[station.id] && <text y={-18} textAnchor="middle" className="fill-slate-700 text-[11px]">{locationCounts[station.id].vehicles} xe · {locationCounts[station.id].drivers} lái xe</text>}
          </g>
          );
        })}
      </svg>

      <div className="absolute bottom-3 left-3 flex gap-4 text-xs bg-white/90 dark:bg-slate-900/90 rounded-md px-3 py-1.5 border border-slate-200 dark:border-slate-800">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-teal-500" /> Bãi
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Trạm sạc
        </span>
      </div>
    </div>
  );
}
