import React, { useRef, useEffect, useState, useCallback } from 'react';

interface DrawingCanvasProps {
  onClose: () => void;
  onSubmit: (imageDataUrl: string) => void;
}

const COLORS = ['#000000', '#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#FFFFFF'];
const BRUSH_SIZES = [4, 8, 16];

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ onClose, onSubmit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1]);
  const historyRef = useRef<ImageData[]>([]);

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (canvas && context) {
        historyRef.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
        if (historyRef.current.length > 20) {
            historyRef.current.shift();
        }
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const parent = canvas.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    contextRef.current = context;
    
    // Set a white background initially
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);

    saveHistory();
  }, [saveHistory]);

  const getCoords = (event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { offsetX: 0, offsetY: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in event.nativeEvent && event.nativeEvent.touches.length > 0) {
      return {
        offsetX: event.nativeEvent.touches[0].clientX - rect.left,
        offsetY: event.nativeEvent.touches[0].clientY - rect.top,
      };
    } else if ('clientX' in event.nativeEvent) {
       return { offsetX: event.nativeEvent.offsetX, offsetY: event.nativeEvent.offsetY };
    }
    return { offsetX: 0, offsetY: 0 };
  };
  
  const startDrawing = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    const { offsetX, offsetY } = getCoords(event);
    const context = contextRef.current;
    if (!context) return;
    saveHistory();
    context.beginPath();
    context.moveTo(offsetX, offsetY);
    setIsDrawing(true);
  }, [saveHistory]);

  const finishDrawing = useCallback(() => {
    const context = contextRef.current;
    if (!context) return;
    context.closePath();
    setIsDrawing(false);
  }, []);

  const draw = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    event.preventDefault();
    const { offsetX, offsetY } = getCoords(event);
    const context = contextRef.current;
    if (!context) return;
    context.strokeStyle = color;
    context.lineWidth = brushSize;
    context.lineTo(offsetX, offsetY);
    context.stroke();
  }, [isDrawing, color, brushSize]);

  const handleUndo = () => {
    if (historyRef.current.length > 1) {
        historyRef.current.pop();
        const lastImageData = historyRef.current[historyRef.current.length - 1];
        if (lastImageData && contextRef.current) {
          contextRef.current.putImageData(lastImageData, 0, 0);
        }
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (canvas && context) {
        saveHistory();
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSubmit = () => {
    const canvas = canvasRef.current;
    if (canvas) {
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        onSubmit(imageDataUrl);
    }
  };

  return (
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-2 md:p-4">
        <div className="relative w-full h-full max-w-3xl max-h-[95%] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-y-2 p-2 bg-gray-100 border-b">
                <div className="flex items-center gap-2">
                    <button onClick={onClose} className="px-3 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 font-semibold">Close</button>
                    <div className="flex gap-1.5 p-1 bg-white rounded-md border">
                        {COLORS.map(c => (
                            <button key={c} onClick={() => setColor(c)} style={{ backgroundColor: c }} className={`w-7 h-7 rounded-full border-2 transition-transform transform hover:scale-110 ${color === c ? 'border-blue-500 ring-2 ring-offset-1 ring-blue-500' : 'border-gray-300'}`}></button>
                        ))}
                    </div>
                </div>
                 <div className="flex items-center gap-2 p-1 bg-white rounded-md border">
                    {BRUSH_SIZES.map(size => (
                        <button key={size} onClick={() => setBrushSize(size)} className={`flex items-center justify-center rounded-full border-2 transition-colors ${brushSize === size ? 'bg-blue-200 border-blue-500' : 'bg-white border-gray-300'}`} style={{width: `${size+16}px`, height: `${size+16}px`}}>
                            <div className="bg-black rounded-full" style={{width: `${size}px`, height: `${size}px`}}></div>
                        </button>
                    ))}
                 </div>
                 <div className="flex items-center gap-2">
                     <button onClick={handleUndo} className="px-3 py-2 bg-gray-200 rounded-md hover:bg-gray-300 text-sm font-medium">Undo</button>
                     <button onClick={handleClear} className="px-3 py-2 bg-gray-200 rounded-md hover:bg-gray-300 text-sm font-medium">Clear</button>
                     <button onClick={handleSubmit} className="px-4 py-2 text-sm bg-green-500 text-white font-bold rounded-md hover:bg-green-600">Done!</button>
                 </div>
            </div>
            <div className="flex-grow w-full h-full bg-white cursor-crosshair" onMouseLeave={finishDrawing}>
                <canvas
                    ref={canvasRef}
                    className="w-full h-full"
                    onMouseDown={startDrawing}
                    onMouseUp={finishDrawing}
                    onMouseMove={draw}
                    onTouchStart={startDrawing}
                    onTouchEnd={finishDrawing}
                    onTouchCancel={finishDrawing}
                    onTouchMove={draw}
                />
            </div>
        </div>
    </div>
  );
};

export default DrawingCanvas;
