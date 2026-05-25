/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="ko" dir="ltr">
    <Head />
    <Preview>본인 확인 코드</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>NONFICTION</Text>
        <Heading style={h1}>본인 확인</Heading>
        <Text style={text}>아래 코드를 입력하여 본인 확인을 완료해 주세요.</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          이 코드는 잠시 후 만료됩니다. 본인이 요청하지 않은 경우 이 메일은
          무시하셔도 됩니다.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeStyle = {
  fontFamily: 'Menlo, Courier, monospace',
  fontSize: '26px',
  letterSpacing: '0.2em',
  fontWeight: 'bold' as const,
  color: '#211d18',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: '#8a8278', margin: '32px 0 0' }
