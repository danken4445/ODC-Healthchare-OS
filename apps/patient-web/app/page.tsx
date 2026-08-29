'use client';
import { createBrowserSupabaseClient } from '@odyssey/supabase-client';
import { useState } from 'react';

export default function Home() {
  const [result, setResult] = useState('');
  async function checkConnection() {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.from('hello_world').select('message').limit(1);
    setResult(error ? `Connection failed: ${error.message}` : data?.[0]?.message ?? 'Connected; no smoke-test row exists.');
  }
  return <main><p>Odyssey Healthcare OS</p><h1>Patient Portal</h1><button onClick={checkConnection}>Check development connection</button>{result && <p role="status">{result}</p>}</main>;
}
