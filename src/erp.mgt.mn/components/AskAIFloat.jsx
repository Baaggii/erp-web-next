import React, { useState, useRef, useEffect } from 'react';

export default function AskAIFloat() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [file, setFile] = useState(null);
  const [open, setOpen] = useState(false);
  const barRef = useRef(null);
  const drag = useRef({ active: false, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    if (!open) return;
    function handleMouseUp() {
      drag.current.active = false;
    }
    function handleMouseMove(e) {
      if (drag.current.active && barRef.current) {
        barRef.current.style.left = `${e.clientX - drag.current.offsetX}px`;
        barRef.current.style.top = `${e.clientY - drag.current.offsetY}px`;
      }
    }
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [open]);

  function handleMouseDown(e) {
    drag.current.active = true;
    drag.current.offsetX = e.clientX - barRef.current.offsetLeft;
    drag.current.offsetY = e.clientY - barRef.current.offsetTop;
  }

  async function sendPrompt() {
    try {
      const form = new FormData();
      form.append('prompt', prompt);
      if (file) {
        form.append('file', file);
      }
      const res = await fetch('/api/openai', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setResponse(data.response);
      setFile(null);
    } catch (err) {
      setResponse('Error: ' + err.message);
    }
  }

  return (
    <>
      {open ? (
        <div id="openai-bar" ref={barRef} style={{ position: 'fixed', bottom: '20px', right: '20px', width: '280px', background: '#fff', border: '1px solid #ccc', padding: '10px', zIndex: 1000 }}>
          <header onMouseDown={handleMouseDown} style={{ cursor: 'move', background: '#f0f0f0', padding: '5px', fontWeight: 'bold', position: 'relative' }}>
            Ask AI
            <button onClick={() => setOpen(false)} style={{ position: 'absolute', right: '4px', top: '2px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
          </header>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Type a prompt..." style={{ width: '100%', height: '60px' }}></textarea>
          <input type="file" onChange={e => setFile(e.target.files[0])} style={{ margin: '4px 0' }} />
          <button onClick={sendPrompt}>Send</button>
          <div className="response" style={{ marginTop: '8px', maxHeight: '150px', overflow: 'auto' }}>{response}</div>
        </div>
        ) : (
          <button id="openai-toggle" onClick={() => setOpen(true)} style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 1000 }}>AI</button>
        )}
    </>
  );
}
