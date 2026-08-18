'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { decodeVehicleQrPayload, type VehicleQrPayload } from '@/domain/qr/vehicleQrPayload';

export interface QrScannerProps {
  onScan: (payload: VehicleQrPayload) => void;
  onClose: () => void;
}

/**
 * Quét QR bằng camera thiết bị - đọc frame liên tục qua canvas, decode bằng jsQR
 * (thư viện thuần JS, không cần quyền đặc biệt ngoài camera). Chỉ chấp nhận QR
 * đúng định dạng xe của hệ thống (qua decodeVehicleQrPayload) - quét trúng QR
 * khác (wifi, quảng cáo...) sẽ bị bỏ qua, KHÔNG báo lỗi làm phiền (vì trong lúc
 * quét có thể vô tình lướt qua QR khác trong khung hình).
 */
export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    let animationFrameId: number;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch {
        setError('Không mở được camera - kiểm tra đã cấp quyền camera cho trình duyệt chưa');
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameId = requestAnimationFrame(tick);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code) {
        const payload = decodeVehicleQrPayload(code.data);
        if (payload) {
          setScanning(false);
          onScan(payload);
          return; // dừng vòng lặp quét, đã tìm thấy đúng QR xe hợp lệ
        }
        // QR quét được nhưng không phải QR xe của hệ thống - tiếp tục quét, không báo lỗi
      }

      animationFrameId = requestAnimationFrame(tick);
    }

    startCamera();

    return () => {
      cancelAnimationFrame(animationFrameId);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [onScan]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        gap: 12,
      }}
    >
      <div style={{ position: 'relative', width: 320, height: 320 }}>
        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} muted playsInline />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div
          style={{
            position: 'absolute',
            inset: 20,
            border: '3px solid #22c55e',
            borderRadius: 8,
            pointerEvents: 'none',
          }}
        />
      </div>

      {error && <p style={{ color: '#fca5a5', fontFamily: 'system-ui, sans-serif' }}>{error}</p>}
      {scanning && !error && (
        <p style={{ color: '#fff', fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
          Đưa mã QR trên xe vào khung hình...
        </p>
      )}

      <button
        onClick={onClose}
        style={{
          padding: '8px 20px',
          borderRadius: 8,
          border: 'none',
          background: '#fff',
          cursor: 'pointer',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Đóng
      </button>
    </div>
  );
}

