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
        <div id="openai-bar" ref={barRef}>
          <header onMouseDown={handleMouseDown}>
            Ask AI
            <button onClick={() => setOpen(false)} className="close-btn">✕</button>
          </header>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type a prompt..."
          />
          <input
            type="file"
            onChange={(e) => setFile(e.target.files[0])}
            style={{ margin: '4px 0' }}
          />
          <button onClick={sendPrompt} className="send-btn">Send</button>
          <div className="response">{response}</div>
        </div>
      ) : (
        <button id="openai-toggle" onClick={() => setOpen(true)}>
          AI
        </button>
      )}
    </>
  );
}
