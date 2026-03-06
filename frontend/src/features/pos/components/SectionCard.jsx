import Stack from '@mui/material/Stack';
import { CardSection } from '../../../components/PageLayout';

export default function SectionCard({ title, subtitle, children, accent }) {
  return (
    <CardSection
      title={title}
      subtitle={subtitle}
      contentSx={{
        border: '1px solid',
        borderColor: accent || 'divider',
        borderRadius: 3,
        background: (theme) => `linear-gradient(165deg, ${theme.palette.background.paper} 0%, ${theme.palette.action.hover} 100%)`,
        boxShadow: (theme) => `0 20px 40px ${theme.palette.action.selected}`,
      }}
    >
      <Stack spacing={2}>
        {children}
      </Stack>
    </CardSection>
  );
}
