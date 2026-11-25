import { useNavigate } from 'react-router-dom';
import Home from './Home.tsx';
import LoginModal from '../components/LoginModal.tsx';

export default function Login() {
  const navigate = useNavigate();

  return (
    <>
      <Home />
      <LoginModal
        open
        onClose={() => navigate('/', { replace: true })}
        onSuccess={() => navigate('/library', { replace: true })}
      />
    </>
  );
}
