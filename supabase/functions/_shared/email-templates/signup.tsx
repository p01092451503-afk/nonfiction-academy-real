/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="ko" dir="ltr">
    <Head />
    <Preview>NONFICTION 이메일 인증을 완료해 주세요</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>NONFICTION</Text>
        <Heading style={h1}>이메일 인증을 완료해 주세요</Heading>
        <Text style={text}>
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          에 가입해 주셔서 감사합니다.
        </Text>
        <Text style={text}>
          아래 버튼을 눌러 이메일 주소(
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          )를 인증해 주세요.
        </Text>
        <Button style={button} href={confirmationUrl}>
          이메일 인증하기
        </Button>
        <Text style={footer}>
          본인이 가입하지 않은 경우 이 메일은 무시하셔도 됩니다.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

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
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#211d18',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#5f574e',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const link = { color: '#211d18', textDecoration: 'underline' }
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
