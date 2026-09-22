import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import Icon from './Icon';
import { formatFileSize } from '../../utils/formatters';
import { getUiScale } from '../../utils/uiScale';

const MAX_PREVIEW_WIDTH = 480;
const MAX_PREVIEW_HEIGHT = 400;
// Modal side padding + gutters on a phone; keeps the stage from being squeezed by CSS.
const MODAL_SIDE_ALLOWANCE = 64;
const MIN_CROP_SIZE = 40;
const HANDLE_SIZE = 14;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// A from-scratch crop tool (drag to move, drag the corner to resize) instead
// of a third-party cropper — after the react-datepicker positioning bug
// earlier in this project, anything with its own drag/resize math stays in
// our own code, where we can see exactly what it does.
function ImageCropModal({ isOpen, file, onClose, onComplete, aspectRatio = null }) {
  const [imageEl, setImageEl] = useState(null);
  const [previewWidth, setPreviewWidth] = useState(MAX_PREVIEW_WIDTH);
  const [previewHeight, setPreviewHeight] = useState(0);
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [useCompression, setUseCompression] = useState(true);
  const [quality, setQuality] = useState(0.75);
  const [isProcessing, setIsProcessing] = useState(false);
  const dragStateRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !file) {
      setImageEl(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // On big screens the modal is wider (rem), so the picture area grows with it.
      const uiScale = getUiScale();
      const maxWidth = Math.min(MAX_PREVIEW_WIDTH * uiScale, Math.max(200, window.innerWidth - MODAL_SIDE_ALLOWANCE * uiScale));
      // Fit inside both limits so a tall portrait photo doesn't push the buttons off-screen.
      const scale = Math.min(maxWidth / img.naturalWidth, (MAX_PREVIEW_HEIGHT * uiScale) / img.naturalHeight);
      const width = img.naturalWidth * scale;
      const height = img.naturalHeight * scale;
      setPreviewWidth(width);
      setPreviewHeight(height);
      setImageEl(img);

      const boxWidth = Math.min(width, height) * 0.8;
      const boxHeight = aspectRatio ? boxWidth / aspectRatio : Math.min(height, width) * 0.8;
      setCrop({
        x: (width - boxWidth) / 2,
        y: (height - boxHeight) / 2,
        width: boxWidth,
        height: boxHeight,
      });
    };
    img.src = objectUrl;

    return () => URL.revokeObjectURL(objectUrl);
  }, [isOpen, file, aspectRatio]);

  useEffect(() => {
    function handlePointerMove(event) {
      const state = dragStateRef.current;
      if (!state || !imageEl) return;
      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;

      if (state.mode === 'move') {
        setCrop((current) => ({
          ...current,
          x: clamp(state.cropStart.x + deltaX, 0, previewWidth - current.width),
          y: clamp(state.cropStart.y + deltaY, 0, previewHeight - current.height),
        }));
      } else if (state.mode === 'resize') {
        setCrop((current) => {
          const maxWidth = previewWidth - current.x;
          const maxHeight = previewHeight - current.y;
          let nextWidth = clamp(state.cropStart.width + deltaX, MIN_CROP_SIZE, maxWidth);
          let nextHeight = aspectRatio
            ? nextWidth / aspectRatio
            : clamp(state.cropStart.height + deltaY, MIN_CROP_SIZE, maxHeight);
          if (aspectRatio && nextHeight > maxHeight) {
            nextHeight = maxHeight;
            nextWidth = nextHeight * aspectRatio;
          }
          return { ...current, width: nextWidth, height: nextHeight };
        });
      }
    }

    function handlePointerUp() {
      dragStateRef.current = null;
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [imageEl, previewWidth, previewHeight, aspectRatio]);

  function startMove(event) {
    event.preventDefault();
    dragStateRef.current = { mode: 'move', startX: event.clientX, startY: event.clientY, cropStart: { ...crop } };
  }

  function startResize(event) {
    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = { mode: 'resize', startX: event.clientX, startY: event.clientY, cropStart: { ...crop } };
  }

  // The parent clears `file` the moment onComplete fires, one render before the
  // effect above clears imageEl — so both must be checked or `file.size` throws.
  if (!imageEl || !file) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Crop image">
        <div className="py-5 text-center text-muted-custom">Loading image...</div>
      </Modal>
    );
  }

  const scale = previewWidth / imageEl.naturalWidth;
  const naturalCropWidth = Math.round(crop.width / scale);
  const naturalCropHeight = Math.round(crop.height / scale);

  function handleApply() {
    setIsProcessing(true);
    const canvas = document.createElement('canvas');
    canvas.width = naturalCropWidth;
    canvas.height = naturalCropHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      imageEl,
      crop.x / scale,
      crop.y / scale,
      naturalCropWidth,
      naturalCropHeight,
      0,
      0,
      naturalCropWidth,
      naturalCropHeight
    );

    const mimeType = useCompression ? 'image/jpeg' : 'image/png';
    canvas.toBlob(
      (blob) => {
        setIsProcessing(false);
        if (!blob) return;
        const dataUrl = canvas.toDataURL(mimeType, useCompression ? quality : undefined);
        onComplete({
          dataUrl,
          blob,
          width: naturalCropWidth,
          height: naturalCropHeight,
          sizeBytes: blob.size,
          originalSizeBytes: file.size,
        });
      },
      mimeType,
      useCompression ? quality : undefined
    );
  }

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary-custom" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="btn btn-primary" onClick={handleApply} disabled={isProcessing}>
        {isProcessing ? (
          <>
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            Processing...
          </>
        ) : (
          'Use this image'
        )}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crop image" footer={footer} size="lg">
      <div className="image-crop">
        <div
          className="image-crop__stage"
          style={{ width: previewWidth, height: previewHeight }}
        >
          <img src={imageEl.src} alt="To crop" className="image-crop__image" draggable={false} />
          <div
            className="image-crop__box"
            style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height }}
            onPointerDown={startMove}
          >
            <div className="image-crop__handle" onPointerDown={startResize} style={{ width: HANDLE_SIZE, height: HANDLE_SIZE }} />
          </div>
        </div>

        <div className="image-crop__meta">
          <Icon name="Crop" size={14} />
          Crop size: {naturalCropWidth} × {naturalCropHeight} px
        </div>

        <div className="d-flex align-items-center justify-content-between mt-4">
          <label className="d-flex align-items-center gap-2 mb-0">
            <input
              type="checkbox"
              className="form-check-input"
              checked={useCompression}
              onChange={(event) => setUseCompression(event.target.checked)}
            />
            <span className="form-label-custom mb-0">Compress before saving</span>
          </label>
          <span className="small text-muted-custom">Original: {formatFileSize(file.size)}</span>
        </div>

        {useCompression ? (
          <div className="mt-3">
            <input
              type="range"
              className="form-range"
              min="0.4"
              max="1"
              step="0.05"
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
            />
            <div className="d-flex justify-content-between small text-muted-custom">
              <span>Smaller file</span>
              <span>{Math.round(quality * 100)}% quality</span>
              <span>Higher quality</span>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export default ImageCropModal;
