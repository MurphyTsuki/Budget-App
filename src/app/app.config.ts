import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
  withInMemoryScrolling,
} from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // Adresses en #/... : fonctionne sur n'importe quel hébergement statique
      withHashLocation(),
      // Les paramètres d'adresse (:category, :account) arrivent directement dans les input() des pages
      withComponentInputBinding(),
      // Chaque changement de page remonte en haut
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
  ],
};
