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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="ko" dir="ltr">
    <Head />
    <Preview>{siteName} 초대장이 도착했습니다</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>NONFICTION</Text>
        <Heading style={h1}>초대장이 도착했습니다</Heading>
        <Text style={text}>
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          에 초대되셨습니다. 아래 버튼을 눌러 초대를 수락하고 계정을
          생성해 주세요.
        </Text>
        <Button style={button} href={confirmationUrl}>
          초대 수락하기
        </Button>
        <Text style={footer}>
          본 초대를 예상하지 못하신 경우 이 메일은 무시하셔도 됩니다.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

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
