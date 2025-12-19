import { useEffect, useState } from 'react';

const APP_PASSWORD = 'Kawa%Cbt';

const Lockdown = ({ children }) => {
  const [authorized, setAuthorized] = useState(false);
  const [input, setInput] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('authorized');
    if (stored === 'true') {
      setAuthorized(true);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input === APP_PASSWORD) {
      localStorage.setItem('authorized', 'true');
      setAuthorized(true);
    } else {
      alert('Złe hasło, spróbuj ponownie.');
    }
  };

  if (!authorized) {
    return (
      <form
        onSubmit={handleSubmit}
        className="lockdown w-screen h-screen flex flex-col justify-center items-center bg-base-200 gap-4"
      >
        <div className="form-control w-full max-w-xs">
          <label className="label text-xs font-bold uppercase" htmlFor="password-input">Wpisz hasło</label>
          <input
            name="password"
            type="password"
            id="password-input"
            className="input input-bordered"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <button className="btn btn-primary w-full max-w-xs">Wejdź</button> 
      </form>
    );
  }

  return children;
}

export default Lockdown;
