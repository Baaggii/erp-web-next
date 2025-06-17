import React, { useState, useRef, useEffect } from 'react';

export default function AskAIFloat() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const barRef = useRef(null);
  const drag = useRef({ active: false, offsetX: 0, offsetY: 0 });

  useEffect(() => {
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
  }, []);

  function handleMouseDown(e) {
    drag.current.active = true;
    drag.current.offsetX = e.clientX - barRef.current.offsetLeft;
    drag.current.offsetY = e.clientY - barRef.current.offsetTop;
  }

  async function sendPrompt() {
    try {
      const res = await fetch('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setResponse(data.response);
    } catch (err) {
      setResponse('Error: ' + err.message);
    }
  }

  return (
    <div id="openai-bar" ref={barRef} style={{ position: 'fixed', bottom: '20px', right: '20px', width: '280px', background: '#fff', border: '1px solid #ccc', padding: '10px', zIndex: 1000 }}>
      <header onMouseDown={handleMouseDown} style={{ cursor: 'move', background: '#f0f0f0', padding: '5px', fontWeight: 'bold' }}>Ask AI</header>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Type a prompt..." style={{ width: '100%', height: '60px' }}></textarea>
      <button onClick={sendPrompt}>Send</button>
      <div className="response" style={{ marginTop: '8px', maxHeight: '150px', overflow: 'auto' }}>{response}</div>
    </div>
  );
}
