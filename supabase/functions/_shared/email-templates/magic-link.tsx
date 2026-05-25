/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="ko" dir="ltr">
    <Head />
    <Preview>{siteName} 로그인 링크</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>NONFICTION</Text>
        <Heading style={h1}>로그인 링크</Heading>
        <Text style={text}>
          아래 버튼을 눌러 {siteName}에 로그인할 수 있습니다.
          링크는 잠시 후 만료됩니다.
        </Text>
        <Button style={button} href={confirmationUrl}>
          로그인하기
        </Button>
        <Text style={footer}>
          본인이 요청하지 않은 경우 이 메일은 무시하셔도 됩니다.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Noto Sans KR', -apple-system, BlinkMacSystemFont, Arial, sans-serif",
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const brand = {
  fontFamily: "'Noto Serif KR', Georgia, serif",
  fontSize: '13px',
  letterSpacing: '0.18em',
  color: '#5f574e',
  margin: '0 0 28px',
}
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#211d18', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#5f574e', lineHeight: '1.6', margin: '0 0 24px' }
const button = {
  backgroundColor: '#211d18',
  color: '#faf6ef',
  fontSize: '14px',
  borderRadius: '12px',
  padding: '12px 22px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '12px', color: '#8a8278', margin: '32px 0 0' }
