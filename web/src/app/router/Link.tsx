import React from 'react';
import { routeToUrl, type Route } from './routes.ts';
import { navigate } from './router.ts';

interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: Route;
}

/** Link de verdade (abre em nova aba com Ctrl/⌘/clique do meio) que navega sem recarregar. */
export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(({ to, onClick, ...rest }, ref) => (
  <a
    ref={ref}
    href={routeToUrl(to)}
    onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(to);
    }}
    {...rest}
  />
));

Link.displayName = 'Link';
