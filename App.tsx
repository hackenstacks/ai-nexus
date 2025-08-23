
import React, { useState, useEffect, useCallback } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { MainLayout } from './components/MainLayout';
import { hasMasterPassword, verifyMasterPassword } from './services/secureStorage';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isPasswordSet, setIsPasswordSet] = useState<boolean>(false);

  useEffect(() => {
    const checkPassword = async () => {
      const isSet = await hasMasterPassword();
      setIsPasswordSet(isSet);
    };
    checkPassword();
  }, []);

  const handleLogin = useCallback(async (password: string) => {
    const isValid = await verifyMasterPassword(password);
    if (isValid) {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  }, []);

  const handlePasswordSet = useCallback(() => {
    setIsPasswordSet(true);
    setIsAuthenticated(true);
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-nexus-dark">
        <AuthScreen
          isPasswordSet={isPasswordSet}
          onLogin={handleLogin}
          onPasswordSet={handlePasswordSet}
        />
      </div>
    );
  }

  return <MainLayout />;
};

export default App;
