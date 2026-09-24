import Error from 'next/error'

CustomErrorComponent.getInitialProps = async (contextData) => {
  return Error.getInitialProps(contextData)
}

export default function CustomErrorComponent(props) {
  return <Error statusCode={props.statusCode} />
}
